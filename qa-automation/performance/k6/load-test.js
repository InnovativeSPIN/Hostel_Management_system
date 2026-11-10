import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp up to 10 VUs
    { duration: '1m', target: 25 },  // Ramp up to 25 VUs
    { duration: '1m', target: 50 },  // Peak load: 50 VUs
    { duration: '30s', target: 0 },  // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'], // 95% of requests must complete below 300ms
    http_req_failed: ['rate<0.01'],                // Error rate < 1%
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:5000';

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: 'admin@demo.college.edu',
      password: 'Admin@123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, {
    'admin login succeeded': (r) => r.status === 200,
  });

  const body = JSON.parse(loginRes.body);
  return { token: body.data.token };
}

export default function (data) {
  const authHeaders = {
    headers: {
      Authorization: `Bearer ${data.token}`,
      Accept: 'application/json',
    },
  };

  // 1. Health check baseline
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health check status 200': (r) => r.status === 200,
  });

  // 2. Fetch Hostels list
  const hostelsRes = http.get(`${BASE_URL}/api/hostels`, authHeaders);
  check(hostelsRes, {
    'hostels fetch status 200': (r) => r.status === 200,
    'hostels returns data': (r) => JSON.parse(r.body).data.length > 0,
  });

  // 3. Command Center dashboard
  const dashRes = http.get(`${BASE_URL}/api/dashboard/command-center`, authHeaders);
  check(dashRes, {
    'command center status 200': (r) => r.status === 200,
    'occupancy data present': (r) => JSON.parse(r.body).data.occupancy !== undefined,
  });

  sleep(1);
}

