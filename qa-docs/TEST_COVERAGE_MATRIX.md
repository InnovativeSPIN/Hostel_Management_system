# Requirements Traceability & Test Coverage Matrix

**Application:** College Hostel Management System (ERP)  
**Matrix Version:** 1.0.0  

---

## 1. Traceability Matrix

| Requirement Area | Business Rule / Scenario | API Endpoint(s) | UI Page(s) | Test Type | Automated Test Suite |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth & Security** | Valid credential authentication | `POST /api/auth/login` | `/login` | API, UI | `workflows.test.js`, `auth.test.js`, `login.spec.js` |
| **Auth & Security** | Bad password rejection (generic message) | `POST /api/auth/login` | `/login` | API, Security | `workflows.test.js`, `auth.test.js` |
| **Auth & Security** | Account lockout after 5 failed logins | `POST /api/auth/login` | `/login` | Security | `auth.test.js`, `security.test.js` |
| **Auth & Security** | Token expiry & token revocation | `GET /api/auth/me` | App Header | API, Security | `workflows.test.js`, `security.test.js` |
| **Auth & Security** | Role permission enforcement | Multiple `/api/*` | AppLayout | Security, RBAC | `workflows.test.js`, `rbac.test.js` |
| **Hostel Ops** | Create hostel block & floors | `POST /api/hostels` | `/hostels` | API, UI | `hostels.test.js`, `hostels.spec.js` |
| **Hostel Ops** | Prevent room overcapacity | `PATCH /api/rooms/:id` | Room Drawer | API, Database | `rooms.test.js`, `db_integrity.test.js` |
| **Bed Allocation** | Allocate available bed to approved student | `POST /api/allocations` | `/allocations` | API, UI | `workflows.test.js`, `allocations.test.js` |
| **Bed Allocation** | Prevent duplicate active bed allocation | `POST /api/allocations` | `/allocations` | API, Database | `workflows.test.js`, `allocations.test.js` |
| **Bed Allocation** | Block allocation in maintenance rooms | `POST /api/allocations` | `/bed-map` | API, UI | `workflows.test.js`, `rooms.test.js` |
| **Bed Allocation** | Gender compatibility enforcement | `POST /api/allocations` | `/allocations` | API, Business | `workflows.test.js`, `allocations.test.js` |
| **Bed Allocation** | Concurrent allocation atomic lock | `POST /api/allocations` | Live Bed Map | Concurrency | `workflows.test.js`, `db_integrity.test.js` |
| **Bed Allocation** | Room transfer with historical record | `POST /api/allocations/transfer` | `/allocations` | API, Database | `workflows.test.js`, `allocations.test.js` |
| **Admissions** | Student application submission | `POST /api/applications` | `/my/application` | API, UI | `applications.test.js`, `admissions.spec.js` |
| **Admissions** | Document upload validation | `POST /api/applications/:id/documents` | `/applications` | Security, API | `applications.test.js`, `security.test.js` |
| **Admissions** | Warden application review & approval | `POST /api/applications/:id/review` | `/applications` | API, UI | `applications.test.js`, `admissions.spec.js` |
| **Attendance** | Daily roll-call with late detection | `POST /api/attendance` | `/attendance` | API, UI | `workflows.test.js`, `attendance.test.js` |
| **Attendance** | Duplicate attendance rejection | `POST /api/attendance` | `/attendance` | API, Business | `workflows.test.js`, `attendance.test.js` |
| **Attendance** | Automatic "on leave" conversion | `POST /api/attendance` | `/attendance` | API, Business | `workflows.test.js`, `attendance.test.js` |
| **Attendance** | Attendance percentage calculation | `GET /api/attendance/student/:id` | `/my/attendance` | API, UI | `workflows.test.js`, `attendance.test.js` |
| **Leaves** | Leave request date range validation | `POST /api/leaves` | `/my/leaves` | API, UI | `workflows.test.js`, `leaves.test.js` |
| **Leaves** | Overlapping leave rejection | `POST /api/leaves` | `/my/leaves` | API, Business | `workflows.test.js`, `leaves.test.js` |
| **Leaves** | Leave approval & student notification | `PATCH /api/leaves/:id/approve` | `/leaves` | API, UI | `workflows.test.js`, `leaves.test.js` |
| **Leaves** | Overdue return detection & exception resolution | `POST /api/leaves/:id/return` | `/leaves` | API, Workflow | `workflows.test.js`, `leaves.test.js` |
| **Complaints** | Create complaint with automatic SLA | `POST /api/complaints` | `/complaints` | API, UI | `workflows.test.js`, `complaints.test.js` |
| **Complaints** | Skill-based staff auto-assignment | `POST /api/complaints` | `/complaints` | API, Business | `workflows.test.js`, `complaints.test.js` |
| **Complaints** | Escalation trigger on SLA breach | Background / API | Action Center | API, Cron | `workflows.test.js`, `complaints.test.js` |
| **Complaints** | Student resolution confirmation & rating | `POST /api/complaints/:id/feedback` | `/my/complaints` | API, UI | `workflows.test.js`, `complaints.test.js` |
| **Fees & Payments** | Fee structure assignment to students | `POST /api/fees/assign` | `/fees` | API, UI | `fees.test.js`, `fees.spec.js` |
| **Fees & Payments** | Partial payment recording & balance calculation | `POST /api/payments` | `/fees` | API, Database | `workflows.test.js`, `payments.test.js` |
| **Fees & Payments** | Overpayment prevention | `POST /api/payments` | `/fees` | API, Business | `workflows.test.js`, `payments.test.js` |
| **Fees & Payments** | Duplicate transaction ID rejection | `POST /api/payments` | `/fees` | API, Database | `workflows.test.js`, `payments.test.js` |
| **Fees & Payments** | Payment record database immutability | `UPDATE payments` | DB Trigger | Database | `workflows.test.js`, `db_integrity.test.js` |
| **Visitors** | Visitor registration & visiting hours override | `POST /api/visitors` | `/visitors` | API, UI | `workflows.test.js`, `visitors.test.js` |
| **Visitors** | Duplicate active check-in prevention | `POST /api/visitors` | `/visitors` | API, Business | `workflows.test.js`, `visitors.test.js` |
| **Visitors** | Security desk check-out | `POST /api/visitors/:id/checkout`| `/security` | API, UI | `workflows.test.js`, `visitors.test.js` |
| **Parent Portal** | Parent view of linked children | `GET /api/parents/children` | `/` (Parent) | API, UI | `workflows.test.js`, `parents.test.js` |
| **Parent Portal** | Cross-student access prohibition (IDOR) | `GET /api/parents/children/:id` | Parent Child | Security | `workflows.test.js`, `security.test.js` |
| **Parent Portal** | Warden parent linking & duplicate prevention | `POST /api/parents/link` | Student Detail | API, Scoping | `workflows.test.js`, `parents.test.js` |
| **Audit Logs** | Event recording across critical operations | `GET /api/audit` | `/audit` | API, UI | `workflows.test.js`, `audit.test.js` |
| **Audit Logs** | Tamper-proof log deletion prohibition | `DELETE FROM audit_logs` | DB Trigger | Database | `workflows.test.js`, `db_integrity.test.js` |

