# Complete Application Source Code & Architecture Audit

**Project:** College Hostel Management System (ERP)  
**Audit Date:** November 9, 2026  
**Auditor:** Senior QA Automation Architect & Application Security Specialist  
**Application Stack:** Node.js (v24 / v20 Alpine), Express 5.2.1, MySQL 8.4, React 19.2.8, Vite 8.3.3, Tailwind CSS v4  

---

## 1. Executive Summary

A comprehensive source code and runtime audit was conducted across the entire Hostel Management ERP repository. The application is an enterprise-grade hostel operations platform featuring 25 REST modules on the backend, 20+ feature views on the frontend, and an extensive MySQL relational schema enforcing strict referential integrity, CHECK constraints, and role-based permissions.

Prior to this audit, running the documented test suite (`cd backend; npm test`) failed with `TypeError: setup is not a function`, and subsequent tests revealed missing parent role definitions, absent database immutability triggers, and a date-bound leave expectation. Through this audit, root causes were identified, database setup orchestration was stabilized, and the baseline test suite achieved **46 out of 46 passing tests (100% pass rate)**.

---

## 2. Architecture & Technology Stack Breakdown

| Layer | Technologies & Libraries | Architectural Notes |
| :--- | :--- | :--- |
| **Backend Framework** | Node.js, Express `^5.2.1` | CommonJS modules, router-per-feature architecture under `src/modules/` |
| **Database Engine** | MySQL 8.4 (InnoDB) | Foreign Keys (`ON DELETE CASCADE / SET NULL`), Generated Columns, CHECK constraints, MySQL triggers |
| **Database Connector** | `mysql2/promise ^3.24.5` | Connection pooling (`connectionLimit: 15`), date strings preserved, decimal numbers converted |
| **Authentication & Auth**| JWT (`jsonwebtoken ^9.0.3`), `bcryptjs ^3.0.3` | Dual verification: JWT bearer token verified against `users.token_version` in DB; 5-minute permission cache |
| **Request Validation** | `zod ^3.25.76` | Strict schema validation middleware attached to mutate endpoints |
| **Document Generation** | `exceljs ^4.4.0`, `pdfkit ^0.20.2` | Native streaming for reports, attendance, and fee ledgers |
| **Frontend Framework** | React `^19.2.8`, Vite `^8.3.0` | Client-side routing with `react-router-dom ^7.18.4`, React Hook Form `^7.89.0` with Zod resolvers |
| **UI & Visuals** | Tailwind CSS `^4.3.3`, Recharts `^3.10.1`, Lucide React | Modern responsive design with collapsible sidebar navigation and real-time KPI dashboards |

---

## 3. Discovered Defects, Root Causes & Applied Remediation

### Defect 1: Broken Database Setup Function & Hardcoded Target Database
- **Severity:** Critical (Blocker)
- **Affected File:** [backend/db/setup.js](file:///c:/Users/pandeeswaran%20p/OneDrive/Hostel_Management_system-main/backend/db/setup.js)
- **Symptom:** Executing `npm test` failed immediately with `TypeError: setup is not a function at resetDatabase (helpers.js:12:9)`.
- **Root Cause:** `backend/db/setup.js` did not export `{ setup }` and invoked `setup()` unconditionally upon `require()`. Furthermore, it read `hostel_erp.sql` which hardcoded `CREATE DATABASE IF NOT EXISTS \`hostel_erp\`` and `USE \`hostel_erp\``, directly violating the test database isolation convention (`<DB_NAME>_test`).
- **Remediation:** Rewrote `setup.js` to accept `{ drop, dbName, silent }`, stripped hardcoded database declarations dynamically, exported `{ setup }`, and added dual CLI/Module execution guards.

### Defect 2: Missing Parent Role, Permissions & Seed User
- **Severity:** High
- **Affected Files:** [backend/db/hostel_erp.sql](file:///c:/Users/pandeeswaran%20p/OneDrive/Hostel_Management_system-main/backend/db/hostel_erp.sql), [backend/src/modules/parents/parents.routes.js](file:///c:/Users/pandeeswaran%20p/OneDrive/Hostel_Management_system-main/backend/src/modules/parents/parents.routes.js)
- **Symptom:** Parent portal tests failed with `login failed for parent.711123104001@demo.college.edu: Invalid email or password` and `POST /api/parents/link` failed with `403 Forbidden: You do not have permission to perform this action`.
- **Root Cause:** The database dump omitted the `parent` role (ID: 6) in the `roles` table, omitted `parent.portal` and `parents.manage` in the `permissions` table, and had no seeded parent user account linked to student `711123104001` (Arun Kumar S) and student `711125104002` (Harini Ramesh).
- **Remediation:** Added automated migration logic in `setup.js` to provision role `parent`, permissions `parent.portal` and `parents.manage`, mapped them in `role_permissions`, and seeded parent account `Shanmugam S` (`parent.711123104001@demo.college.edu` / `Parent@123`) linked to both student records.

### Defect 3: Missing Database Immutability Triggers
- **Severity:** High
- **Affected Tables:** `payments`, `audit_logs`
- **Symptom:** Tests expecting database-level immutability failed with `AssertionError: Missing expected rejection (/immutable/)` and `(/read-only/)`.
- **Root Cause:** The SQL schema dump omitted the `BEFORE UPDATE ON payments` and `BEFORE UPDATE/DELETE ON audit_logs` triggers.
- **Remediation:** Created triggers:
  1. `trg_payments_no_update` -> `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments are immutable'`
  2. `trg_audit_logs_no_update` -> `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are read-only and immutable'`
  3. `trg_audit_logs_no_delete` -> `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are read-only and immutable'`

### Defect 4: Static Calendar Date in Leave Integration Workflow Test
- **Severity:** Medium
- **Affected Test:** [backend/tests/workflows.test.js](file:///c:/Users/pandeeswaran%20p/OneDrive/Hostel_Management_system-main/backend/tests/workflows.test.js#L191)
- **Symptom:** Test `turns an absence into "on leave" when an approved leave covers the date` failed because `onLeave` query returned `null` and subsequently `status` remained `'absent'`.
- **Root Cause:** Seed data had fixed leave dates in October 2026. At runtime (November 2026), no approved leave covered `CURDATE()`. Additionally, row 1 had `returned_at` populated, which caused the roster query to exclude active leave.
- **Remediation:** Configured `setup.js` to ensure leave record ID 1 has `from_date = CURDATE() - 1`, `to_date = CURDATE() + 2`, `status = 'approved'`, and `returned_at = NULL`.

---

## 4. Security & Access Control Findings

1. **JWT & Session Revocation:**
   - Implemented using a dual check: the payload's token version (`tv`) is verified against the database's `users.token_version`.
   - Logging out increments `token_version`, instantly invalidating tokens globally without requiring a Redis blacklist.
2. **Account Lockout:**
   - Handled via `users.failed_logins`. After 5 consecutive invalid attempts, `status` changes to `'locked'` requiring administrator intervention or password reset.
3. **Scoping Verification:**
   - Wardens are strictly restricted to their assigned hostels via `user.hostelIds` middleware check.
   - Cross-hostel queries (e.g. boys hostel warden accessing girls hostel rooms) correctly reject with HTTP 403 Forbidden.
   - Parents are strictly scoped to linked children via `assertChild(req.user, studentId)`.
4. **Rate Limiting:**
   - Configured via `express-rate-limit` (2,000 requests per 15-minute window in development/production, 100,000 in test).
5. **Security Headers:**
   - `helmet` is active, removing `x-powered-by` and applying standard CSP and frame protection headers.

---

## 5. Next Steps for Complete QA Automation Framework

1. Implement comprehensive API test suites across all 25 modules to test boundaries, invalid inputs, and duplicate operations.
2. Build Playwright TypeScript E2E test suites covering real user journeys for Super Admin, Warden, Staff, Security, Student, and Parent.
3. Implement database transaction rollback and constraint stress tests (e.g. concurrent bed allocations).
4. Create k6 performance scenarios for load testing.
5. Create automated HTML reports and CI/CD pipelines.

