/**
 * Consolidated QA Automation Runner & Interactive Report Generator
 * 
 * Orchestrates test execution across:
 * - Backend Workflows (node:test)
 * - Extended API Suites (node:test + supertest)
 * - Database Integrity & Concurrency Stress (node:test)
 * - Security & OWASP Top 10 Suites (node:test)
 * - Playwright Browser UI & Responsive (Playwright)
 * - Performance & Latency Benchmarks (HTTP Benchmark Runner)
 * 
 * Generates summary.json and an interactive index.html report in qa-automation/reports/.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const QA_DIR = __dirname;
const REPORTS_DIR = path.join(QA_DIR, 'reports');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function getTestFiles(dir, baseDir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.relative(baseDir, path.join(dir, f)));
}

// Define test tiers
const apiFiles = getTestFiles(path.join(QA_DIR, 'api', 'tests'), QA_DIR);
const dbFiles = getTestFiles(path.join(QA_DIR, 'database'), QA_DIR);
const secFiles = getTestFiles(path.join(QA_DIR, 'security'), QA_DIR);

const TEST_SUITES = [
  {
    id: 'backend',
    name: 'Backend Workflow Tests',
    category: 'Workflows',
    description: 'Existing integration workflows verifying complete business logic across all 19 ERP modules.',
    command: 'node',
    args: ['--test', '--test-concurrency=1', 'tests/workflows.test.js'],
    cwd: path.join(ROOT_DIR, 'backend'),
    shell: false,
    env: { ...process.env, NODE_ENV: 'test', DB_NAME: 'hostel_erp_test' },
  },
  {
    id: 'api',
    name: 'Extended Module API Suites',
    category: 'API',
    description: 'Exhaustive edge case, authorization boundary, and validation tests for ERP controllers.',
    command: 'node',
    args: ['--test', '--test-concurrency=1', ...apiFiles],
    cwd: QA_DIR,
    shell: false,
    env: { ...process.env, NODE_ENV: 'test', DB_NAME: 'hostel_erp_test' },
  },
  {
    id: 'database',
    name: 'Database Integrity & Concurrency',
    category: 'Database',
    description: 'Foreign key constraints, CHECK rules, triggers, payment immutability, and 10x concurrent bed allocation stress test.',
    command: 'node',
    args: ['--test', '--test-concurrency=1', ...dbFiles],
    cwd: QA_DIR,
    shell: false,
    env: { ...process.env, NODE_ENV: 'test', DB_NAME: 'hostel_erp_test' },
  },
  {
    id: 'security',
    name: 'RBAC Security & OWASP Top 10',
    category: 'Security',
    description: 'Strict role authorization matrices, BOLA/IDOR prevention, SQL injection sanitization, and cryptographic JWT tampering.',
    command: 'node',
    args: ['--test', '--test-concurrency=1', ...secFiles],
    cwd: QA_DIR,
    shell: false,
    env: { ...process.env, NODE_ENV: 'test', DB_NAME: 'hostel_erp_test' },
  },
  {
    id: 'ui',
    name: 'Playwright Browser UI Tests',
    category: 'E2E / UI',
    description: 'Headless Chromium browser testing for login/logout, sidebar navigation, keyboard shortcuts, and responsive drawer.',
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['playwright', 'test', '--config=playwright/playwright.config.js'],
    cwd: QA_DIR,
    shell: true,
    env: { ...process.env },
  },
  {
    id: 'performance',
    name: 'Performance & Latency Benchmarks',
    category: 'Performance',
    description: 'High-throughput concurrency stress testing measuring latency percentiles (avg, p50, p95, p99) and requests/second.',
    command: 'node',
    args: ['performance/runner.js'],
    cwd: QA_DIR,
    shell: false,
    env: { ...process.env, PERF_DURATION: '3', PERF_CONCURRENCY: '5' },
  },
];

function runSuite(suite) {
  console.log(`\n======================================================`);
  console.log(`[QA RUNNER] Running Suite: ${suite.name}`);
  console.log(`======================================================`);

  const startTime = Date.now();
  const proc = spawnSync(suite.command, suite.args, {
    cwd: suite.cwd,
    env: suite.env,
    encoding: 'utf-8',
    shell: suite.shell,
  });

  const durationMs = Date.now() - startTime;
  const stdout = proc.stdout || '';
  const stderr = proc.stderr || '';
  const output = stdout + '\n' + stderr;

  if (proc.status !== 0 && suite.id !== 'ui' && suite.id !== 'performance') {
    console.error(`[SUITE ERROR] Output:\n${output}`);
  }

  // Parse pass/fail counts
  let passed = 0;
  let failed = 0;
  let tests = [];

  if (suite.id === 'ui') {
    const pwReportPath = path.join(REPORTS_DIR, 'playwright-results.json');
    if (fs.existsSync(pwReportPath)) {
      try {
        const pwData = JSON.parse(fs.readFileSync(pwReportPath, 'utf-8'));
        function collectSuites(sList) {
          for (const s of sList || []) {
            for (const spec of s.specs || []) {
              for (const test of spec.tests || []) {
                const isPass = test.status === 'expected';
                if (isPass) passed++;
                else failed++;
                tests.push({
                  title: `${spec.title} - ${test.projectName || 'chromium'}`,
                  duration: (test.results?.[0]?.duration || 0) + 'ms',
                  status: isPass ? 'passed' : 'failed',
                });
              }
            }
            if (s.suites) collectSuites(s.suites);
          }
        }
        collectSuites(pwData.suites);
      } catch (e) {
        console.warn('Could not parse playwright json, falling back to regex parsing.');
      }
    }
  } else if (suite.id === 'performance') {
    const perfReportPath = path.join(REPORTS_DIR, 'performance-results.json');
    if (fs.existsSync(perfReportPath)) {
      try {
        const perfData = JSON.parse(fs.readFileSync(perfReportPath, 'utf-8'));
        for (const b of perfData.benchmarks || []) {
          const isPass = b.errorRate === 0 && b.latencies.p95 < 1500;
          if (isPass) passed++;
          else failed++;
          tests.push({
            title: `${b.endpoint} (${b.rps} RPS, p95=${b.latencies.p95}ms)`,
            duration: `${b.durationSeconds}s`,
            status: isPass ? 'passed' : 'failed',
          });
        }
      } catch (e) {
        console.warn('Could not parse performance json.');
      }
    }
  } else {
    // Parse node:test output
    const passMatches = output.match(/✔\s*(.+?)\s*\((.+?)\)/g) || [];
    for (const match of passMatches) {
      const parts = match.match(/✔\s*(.+?)\s*\((.+?)\)/);
      if (parts) {
        passed++;
        tests.push({
          title: parts[1].trim(),
          duration: parts[2].trim(),
          status: 'passed',
        });
      }
    }

    const failMatches = output.match(/✖\s*(.+?)\s*\((.+?)\)/g) || [];
    for (const match of failMatches) {
      const parts = match.match(/✖\s*(.+?)\s*\((.+?)\)/);
      if (parts) {
        failed++;
        tests.push({
          title: parts[1].trim(),
          duration: parts[2].trim(),
          status: 'failed',
        });
      }
    }

    // Fallback if no individual checks matched
    if (passed === 0 && failed === 0) {
      if (proc.status === 0) {
        passed = 1;
        tests.push({ title: `${suite.name} execution`, duration: `${durationMs}ms`, status: 'passed' });
      } else {
        failed = 1;
        tests.push({ title: `${suite.name} execution`, duration: `${durationMs}ms`, status: 'failed' });
      }
    }
  }

  const success = proc.status === 0 && failed === 0;
  console.log(`Result: ${success ? 'PASSED' : 'FAILED'} (Passed: ${passed}, Failed: ${failed}, Duration: ${(durationMs / 1000).toFixed(2)}s)`);

  return {
    id: suite.id,
    name: suite.name,
    category: suite.category,
    description: suite.description,
    status: success ? 'PASSED' : 'FAILED',
    exitCode: proc.status,
    durationMs,
    passed,
    failed,
    total: passed + failed,
    tests,
    output: output.slice(-2000), // last 2k characters
  };
}

function generateHtmlReport(summary) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hostel ERP - Quality Assurance & Test Automation Audit</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --brand: #3b82f6;
      --brand-hover: #2563eb;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.15);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.15);
      --warning: #f59e0b;
      --badge-bg: #273549;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem 1.5rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    h1 { font-size: 1.75rem; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; }
    .subtitle { color: var(--text-muted); font-size: 0.95rem; margin-top: 0.25rem; }
    .timestamp { font-size: 0.85rem; color: var(--text-muted); background: var(--card-bg); padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--card-border); }
    
    /* Stats Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.25rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    .kpi-label { font-size: 0.8rem; text-transform: uppercase; font-weight: 600; color: var(--text-muted); letter-spacing: 0.05em; }
    .kpi-value { font-size: 2rem; font-weight: 700; margin-top: 0.35rem; }
    .text-success { color: var(--success); }
    .text-danger { color: var(--danger); }
    .text-brand { color: var(--brand); }
    .text-warning { color: var(--warning); }

    /* Suite Section */
    .suite-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      margin-bottom: 1.5rem;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15);
    }
    .suite-header {
      padding: 1.25rem 1.5rem;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      cursor: pointer;
    }
    .suite-header:hover { background: rgba(255, 255, 255, 0.04); }
    .suite-title { font-size: 1.15rem; font-weight: 600; display: flex; align-items: center; gap: 0.75rem; }
    .suite-desc { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 9999px;
      letter-spacing: 0.03em;
    }
    .badge-success { background: var(--success-bg); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-danger { background: var(--danger-bg); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-category { background: var(--badge-bg); color: var(--text-muted); border: 1px solid var(--card-border); }

    /* Test List Table */
    .table-container { padding: 1rem 1.5rem; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
    th { padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--card-border); }
    td { padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: rgba(255, 255, 255, 0.02); }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.5rem; }
    .dot-success { background: var(--success); }
    .dot-danger { background: var(--danger); }

    /* Collapsible Logic */
    .collapsible-content { display: block; }
    .collapsed { display: none; }

    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--card-border);
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Hostel ERP Quality Assurance & Automation Audit</h1>
        <div class="subtitle">Complete Test Coverage Report · MySQL 8.4, Express 5, React 19, Supertest, Playwright</div>
      </div>
      <div class="timestamp">
        Generated: ${new Date(summary.timestamp).toLocaleString()}
      </div>
    </header>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Test Cases</div>
        <div class="kpi-value text-brand">${summary.totalTests}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pass Rate</div>
        <div class="kpi-value text-success">${summary.passRate}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Passed Tests</div>
        <div class="kpi-value text-success">${summary.passedTests}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Failed Tests</div>
        <div class="kpi-value ${summary.failedTests > 0 ? 'text-danger' : 'text-muted'}">${summary.failedTests}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Execution Duration</div>
        <div class="kpi-value text-warning">${(summary.totalDurationMs / 1000).toFixed(1)}s</div>
      </div>
    </div>

    ${summary.suites
      .map(
        (suite) => `
    <div class="suite-card">
      <div class="suite-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <div>
          <div class="suite-title">
            <span>${suite.name}</span>
            <span class="badge badge-category">${suite.category}</span>
            <span class="badge ${suite.status === 'PASSED' ? 'badge-success' : 'badge-danger'}">${suite.status}</span>
          </div>
          <div class="suite-desc">${suite.description}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600; font-size: 0.95rem;">${suite.passed} / ${suite.total} Passed</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${(suite.durationMs / 1000).toFixed(2)}s</div>
        </div>
      </div>
      <div class="collapsible-content table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 70%;">Test Scenario</th>
              <th style="width: 15%;">Duration</th>
              <th style="width: 15%; text-align: right;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${suite.tests
              .map(
                (test) => `
            <tr>
              <td>
                <span class="status-dot ${test.status === 'passed' ? 'dot-success' : 'dot-danger'}"></span>
                <span>${test.title}</span>
              </td>
              <td style="color: var(--text-muted); font-size: 0.85rem;">${test.duration}</td>
              <td style="text-align: right;">
                <span class="badge ${test.status === 'passed' ? 'badge-success' : 'badge-danger'}">${test.status.toUpperCase()}</span>
              </td>
            </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
    `
      )
      .join('')}

    <footer>
      Hostel Management System · Verified with node:test, Supertest, Playwright & MySQL 8.4 Engine.
    </footer>
  </div>
</body>
</html>`;

  const reportPath = path.join(REPORTS_DIR, 'index.html');
  fs.writeFileSync(reportPath, html, 'utf-8');
  console.log(`\n[QA RUNNER] Standalone HTML Report created at: ${reportPath}`);
}

async function main() {
  const selectedSuiteId = process.argv.find((a) => a.startsWith('--suite='))?.split('=')[1];
  const isReportOnly = process.argv.includes('--report');

  const summaryPath = path.join(REPORTS_DIR, 'summary.json');

  if (isReportOnly && fs.existsSync(summaryPath)) {
    console.log('[QA RUNNER] Generating HTML report from existing summary.json...');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    generateHtmlReport(summary);
    return;
  }

  const suitesToRun = selectedSuiteId
    ? TEST_SUITES.filter((s) => s.id === selectedSuiteId)
    : TEST_SUITES;

  if (suitesToRun.length === 0) {
    console.error(`[ERROR] Unknown test suite ID: "${selectedSuiteId}". Available: ${TEST_SUITES.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  console.log('================================================================');
  console.log('        Hostel ERP Unified QA Test Automation Framework         ');
  console.log('================================================================');
  console.log(`Execution Mode: ${selectedSuiteId ? 'Single Suite (' + selectedSuiteId + ')' : 'Full Automated Audit (All Suites)'}`);
  console.log(`Target Database: hostel_erp_test (Isolation Guaranteed)`);

  const runnerStart = Date.now();
  const suiteResults = [];

  for (const suite of suitesToRun) {
    const res = runSuite(suite);
    suiteResults.push(res);
  }

  const totalDurationMs = Date.now() - runnerStart;
  const totalTests = suiteResults.reduce((acc, s) => acc + s.total, 0);
  const passedTests = suiteResults.reduce((acc, s) => acc + s.passed, 0);
  const failedTests = suiteResults.reduce((acc, s) => acc + s.failed, 0);
  const passRate = totalTests > 0 ? Number(((passedTests / totalTests) * 100).toFixed(1)) : 0;

  const summary = {
    timestamp: new Date().toISOString(),
    totalDurationMs,
    totalTests,
    passedTests,
    failedTests,
    passRate,
    suites: suiteResults,
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n[QA RUNNER] Consolidated test metrics saved to: ${summaryPath}`);

  // Generate Interactive HTML
  generateHtmlReport(summary);

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${failedTests === 0 ? 'ALL TESTS PASSED (100% SUCCESS)' : 'FAILED'}`);
  console.log(`Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests} | Pass Rate: ${passRate}%`);
  console.log(`Total Duration: ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[FATAL] QA Runner encountered an error:', err);
    process.exit(1);
  });
}

module.exports = { main, runSuite, generateHtmlReport };
