/**
 * Automated Performance & Latency Benchmark Runner
 * 
 * Executes concurrent stress requests against key Hostel ERP API endpoints,
 * calculates latency percentiles (min, avg, p50, p95, p99, max), throughput (RPS),
 * and generates a structured report at qa-automation/reports/performance-results.json.
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:5000';
const REQUESTS_PER_ENDPOINT = parseInt(process.env.PERF_REQUESTS || '50', 10);
const CONCURRENCY = parseInt(process.env.PERF_CONCURRENCY || '5', 10);

async function authenticateAdmin() {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@demo.college.edu',
        password: 'Admin@123',
      }),
    });
    if (!res.ok) {
      throw new Error(`Admin auth failed with status ${res.status}`);
    }
    const data = await res.json();
    return data.data.token;
  } catch (err) {
    console.warn(`[WARN] Admin login failed: ${err.message}. Running unauthenticated benchmarks only.`);
    return null;
  }
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = Number((sum / sorted.length).toFixed(2));
  const min = Number(sorted[0].toFixed(2));
  const max = Number(sorted[sorted.length - 1].toFixed(2));

  const p50 = Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2));
  const p95 = Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2));
  const p99 = Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2));

  return { min, max, avg, p50, p95, p99 };
}

async function benchmarkEndpoint(name, url, token, totalRequestsTarget, concurrency) {
  console.log(`\n  Benchmarking: ${name} (${url})`);
  console.log(`  Concurrency: ${concurrency} | Total Requests: ${totalRequestsTarget}`);

  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let sentCount = 0;

  const startTime = performance.now();

  async function worker() {
    while (sentCount < totalRequestsTarget) {
      sentCount++;
      const reqStart = performance.now();
      try {
        const res = await fetch(url, { headers });
        const reqDuration = performance.now() - reqStart;
        if (res.ok) {
          successfulRequests++;
          latencies.push(reqDuration);
        } else {
          failedRequests++;
        }
      } catch (err) {
        failedRequests++;
      }
    }
  }

  // Launch parallel workers
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const actualDurationMs = performance.now() - startTime;
  const actualDurationSec = actualDurationMs / 1000;
  const totalRequests = successfulRequests + failedRequests;
  const rps = Number((totalRequests / (actualDurationSec || 0.001)).toFixed(2));
  const percentiles = calculatePercentiles(latencies);
  const errorRate = Number(((failedRequests / (totalRequests || 1)) * 100).toFixed(2));

  console.log(`    Executed Requests: ${totalRequests} (${rps} RPS)`);
  console.log(`    Success: ${successfulRequests} | Failed: ${failedRequests} (Error Rate: ${errorRate}%)`);
  console.log(`    Latency: Avg=${percentiles.avg}ms | p50=${percentiles.p50}ms | p95=${percentiles.p95}ms | p99=${percentiles.p99}ms | Max=${percentiles.max}ms`);

  return {
    endpoint: name,
    url,
    totalRequests,
    successfulRequests,
    failedRequests,
    errorRate,
    durationSeconds: Number(actualDurationSec.toFixed(2)),
    rps,
    latencies: percentiles,
  };
}

async function run() {
  console.log('====================================================');
  console.log('       Hostel ERP Performance Benchmark Suite       ');
  console.log('====================================================');
  console.log(`Target Host: ${BASE_URL}`);

  const token = await authenticateAdmin();

  const scenarios = [
    {
      name: 'System Health Check',
      url: `${BASE_URL}/api/health`,
      token: null, // Public baseline
    },
    {
      name: 'Hostel Roster List',
      url: `${BASE_URL}/api/hostels`,
      token,
    },
    {
      name: 'Command Center Analytics',
      url: `${BASE_URL}/api/dashboard/command`,
      token,
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    const res = await benchmarkEndpoint(
      scenario.name,
      scenario.url,
      scenario.token,
      REQUESTS_PER_ENDPOINT,
      CONCURRENCY
    );
    results.push(res);
  }

  // Save report
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, 'performance-results.json');
  const payload = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    concurrency: CONCURRENCY,
    requestsPerEndpoint: REQUESTS_PER_ENDPOINT,
    benchmarks: results,
  };

  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\nPerformance benchmark report saved to: ${reportPath}`);
  console.log('====================================================\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Performance benchmark encountered an error:', err);
    process.exit(1);
  });
}

module.exports = { run, benchmarkEndpoint };
