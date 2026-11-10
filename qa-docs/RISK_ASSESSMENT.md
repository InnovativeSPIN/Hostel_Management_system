# Application Risk Assessment & Threat Modeling

**Application:** College Hostel Management System (ERP)  
**Methodology:** OWASP Top 10, STRIDE Threat Modeling & Financial Integrity Audit  

---

## 1. Risk Heatmap & Priority Matrix

| Risk ID | Risk Description | Severity | Likelihood | Impact | Current Safeguard | QA Verification Plan |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **RSK-01** | **Race Condition on Bed Allocation:** Two simultaneous admission requests receiving the exact same bed | **CRITICAL** | Medium | Catastrophic (Room conflict, physical safety) | MySQL transactions with `FOR UPDATE` row lock | Automated concurrent requests test in test suite |
| **RSK-02** | **Financial Record Tampering:** In-place modification or deletion of payment records or transaction IDs | **CRITICAL** | Low | Catastrophic (Embezzlement, accounting loss) | MySQL trigger `trg_payments_no_update` | Database trigger rejection test (`/immutable/`) |
| **RSK-03** | **IDOR in Parent Portal:** A parent user accessing academic, attendance or fee records of another student | **HIGH** | Medium | Severe (FERPA / Privacy breach, student safety) | Middleware `assertChild` checking `req.user.childIds` | Negative authorization test with foreign IDs |
| **RSK-04** | **Cross-Hostel Warden Privilege Escalation:** Warden modifying rooms, students or attendance of another hostel | **HIGH** | Medium | Severe (Unauthorized operations) | Scoping helper `assertStudentInScope` & `user.hostelIds` | Scoping test querying other hostels' IDs |
| **RSK-05** | **Malicious File Upload:** Uploading executable or polyglot scripts via admission or leave document uploads | **HIGH** | Low | Critical (Remote code execution on server) | Multer file size cap (2MB) & extension whitelist | Binary magic-byte upload validation test |
| **RSK-06** | **Attendance / Leave Discrepancy:** Absent students marked present or on leave without approved record | **MEDIUM** | Medium | Moderate (Truancy, safety tracking failure) | Automated status override in `attendance.service.js` | Integration test verifying automatic conversion |
| **RSK-07** | **Audit Trail Truncation:** Rogue staff member deleting audit logs to conceal unauthorized actions | **HIGH** | Low | Severe (Loss of non-repudiation) | Database triggers `trg_audit_logs_no_delete/update` | Direct SQL test attempting deletion |
| **RSK-08** | **Brute-Force Credential Stuffing:** Automated password guessing against student and staff accounts | **MEDIUM** | High | Severe (Account takeover) | Account lockout after 5 attempts + rate limiting | Automated brute-force test verifying 5-attempt lock |

---

## 2. In-Depth Threat Analysis

### A. Bed Allocation Concurrency (RSK-01)
- **Threat Vector:** During semester intake, dozens of wardens or students submit allocation requests in the same minute.
- **Vulnerability:** If application code reads `b.status === 'available'` without row-level locking (`SELECT ... FOR UPDATE`), two threads can read the bed as available, issue two `INSERT INTO room_allocations`, and set occupancy above capacity.
- **Mitigation in Source:** [allocations.service.js](file:///c:/Users/pandeeswaran%20p/OneDrive/Hostel_Management_system-main/backend/src/modules/allocations/allocations.service.js) uses `conn.query('SELECT ... FOR UPDATE')` inside `db.transaction()`.
- **Test Strategy:** Two simultaneous HTTP requests sent via `Promise.all` targeting the same bed ID. Assert that exactly one succeeds (201 Created) and the other fails with HTTP 409 Conflict (`BED_OCCUPIED`).

### B. Payment Immutability & Overpayment Prevention (RSK-02)
- **Threat Vector:** An administrator or compromised backend service issues an UPDATE statement modifying fee balances or deleting payments.
- **Mitigation in Source:** Database-level trigger `trg_payments_no_update` throws SQLSTATE 45000 before any update occurs. Additionally, `payments.service.js` validates that `amount <= fee.balance`.
- **Test Strategy:** Direct query execution `UPDATE payments SET amount = 1` must reject with regex `/immutable/`.

### C. Parent Portal Scoping (RSK-03)
- **Threat Vector:** A parent logs in, inspects network calls to `/api/parents/children/1`, and changes the URL to `/api/parents/children/2`.
- **Mitigation in Source:** [parents.routes.js](file:///c:/Users/pandeeswaran%20p/OneDrive/Hostel_Management_system-main/backend/src/modules/parents/parents.routes.js) executes `assertChild(req.user, studentId)`:
  ```js
  if (!user.childIds.includes(Number(studentId))) throw forbidden('This student is not linked to your account');
  ```
- **Test Strategy:** Authenticate as `parent.711123104001@demo.college.edu` (linked only to students 1 and 38), and issue GET requests for student IDs 2, 3, and 5. Verify HTTP 403 Forbidden on each.

