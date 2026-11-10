# Enterprise Test Strategy & QA Architecture

**Application:** College Hostel Management System (ERP)  
**Framework Version:** 1.0.0  
**Target Environments:** Local Docker Compose / Dedicated CI Test DB / Staging  

---

## 1. Quality Assurance Mission & Objectives

The primary objective of this quality engineering strategy is to provide 360-degree verification of business logic, financial accuracy, transactional consistency, role-based boundary enforcement, and real browser user experience without modifying production business rules or substituting the existing technology stack.

Key quality goals:
1. **Zero Financial Drift:** Prevent overpayments, double-counting, or mutable payment records.
2. **Absolute Bed Integrity:** Mathematically guarantee that no bed has multiple active student occupants under race conditions.
3. **Rigorous Scoping:** Enforce that wardens cannot view or mutate out-of-scope hostels, and parents cannot access unlinked students.
4. **Deterministic Automation:** Tests must be repeatable, self-contained, clean up after themselves, and run either via one consolidated command (`npm run qa`) or modularly.

---

## 2. Test Automation Pyramid

```
                ▲
               / \
              /   \
             / E2E \       Playwright Browser Automation (TypeScript/JS)
            / Browser\     - Realistic clicks, forms, drawers, modal flows
           /-----------\   - All 6 roles exercised on Chromium / Firefox
          /             \
         /  Integration  \   Supertest + Node.js Test Runner
        /   API Testing   \  - Full coverage of all 25 REST modules
       /-------------------\ - Negative payloads, boundaries, authentication
      /                     \
     /   Database Integrity  \   MySQL Constraint & Transaction Testing
    /    & Security Tests     \  - Rollback integrity, trigger checks, OWASP
   /---------------------------\ - Concurrency simulation (simultaneous allocations)
```

---

## 3. Test Layers & Tooling

| Layer | Tools & Libraries | Execution Method | Target Files |
| :--- | :--- | :--- | :--- |
| **Existing Workflows** | `node:test`, `supertest` | `npm run test` (in backend) | `backend/tests/workflows.test.js` |
| **Extended API Tests** | `node:test`, `supertest` | `npm run qa:api` | `qa-automation/api/tests/**/*.test.js` |
| **Database Integrity** | `mysql2/promise`, `node:test`| `npm run qa:database` | `qa-automation/database/**/*.test.js`|
| **Security & RBAC** | `node:test`, `supertest` | `npm run qa:security` | `qa-automation/security/**/*.test.js`|
| **UI E2E Automation** | `@playwright/test` | `npm run qa:ui` | `qa-automation/playwright/tests/**/*.spec.js` |
| **Performance Tests** | `k6` & Node load tester | `npm run qa:perf` | `qa-automation/performance/` |

---

## 4. Test Environment & Database Isolation Protocol

In accordance with strict environment safety rules:
1. **Never Touch Development / Production DB:**
   - Tests run against an isolated database with the suffix `_test` (e.g. `hostel_erp_test`).
   - The test runner asserts that `process.env.NODE_ENV === 'test'` and `process.env.DB_NAME` ends with `_test`.
2. **Background Jobs Disabled:**
   - `JOBS_ENABLED=false` is enforced during tests to prevent automated background cron tasks (e.g. SLA escalation schedulers) from racing with test assertions.
3. **Safe Tear-Up & Tear-Down:**
   - Database reset rebuilds the schema and seeds baseline accounts deterministically.
   - Database connections pool is properly closed at the end of each test suite (`after(async () => db.pool.end())`).

---

## 5. Defect Management & Severity Triage

| Severity | Definition | SLA / Action Required |
| :--- | :--- | :--- |
| **Critical** | Data corruption, financial miscalculation, concurrent bed double-allocation, system crash | Immediate fix and regression test required before progression |
| **High** | Privilege escalation, broken access control (e.g. cross-hostel leak), failing business workflow | Must be resolved in current sprint; regression test mandatory |
| **Medium** | Validation mismatch, improper error code, edge-case UI misalignment | Documented in Defect Register and scheduled for patch |
| **Low** | Minor typo, styling inconsistency, non-blocking telemetry discrepancy | Logged as informational or low-priority enhancement |

---

## 6. One-Command Execution & CI/CD Pipeline

The framework provides unified scripts in the root `package.json`:
- `npm run qa`: Complete end-to-end QA execution across Backend Workflows, API Automation, Database Integrity, and Security.
- `npm run qa:backend`: Existing 46 verified backend workflow tests.
- `npm run qa:api`: Comprehensive REST API regression tests.
- `npm run qa:database`: Database constraints and transaction rollback tests.
- `npm run qa:security`: OWASP and RBAC security tests.
- `npm run qa:ui`: Playwright browser-based UI automation.
- `npm run qa:report`: Consolidated HTML report generation.

