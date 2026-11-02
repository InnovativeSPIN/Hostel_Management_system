# Hostel ERP: Hostel Operations Platform

A full-stack hostel management system for an engineering college. It covers admissions, live bed allocation, attendance, leave, complaints with SLA escalation, maintenance, fees, visitors, activities, notifications, reports and an audit trail. Each user sees the problems that need their attention first.

> **Stack:** React 19 + Vite · Tailwind CSS 4 · Recharts · React Hook Form + Zod · Axios — Node.js + Express 5 · MySQL 8 (mysql2) · JWT · bcrypt (bcryptjs)

---

## Contents
1. [Features](#features)
2. [Architecture](#architecture)
3. [Installation & running](#installation--running)
4. [Environment variables](#environment-variables)
5. [Database setup & seed data](#database-setup--seed-data)
6. [User roles](#user-roles)
7. [API documentation](#api-documentation)
8. [Testing](#testing)
9. [Production build & deployment](#production-build--deployment)

---

## Features

| Area | What it does |
|---|---|
| **Hostel Command Center** | Shows today's exceptions first (absent, overdue returns, SLA breaches, overdue fees, attendance not marked, stale maintenance). Below them sit the Action Center, today's KPIs, the Hostel Health Score per hostel and analytics charts. |
| **Action Center** | Lists every record that needs a decision, ranked high, medium or low. Each item links straight to the record. |
| **Live Bed Map** | Shows every bed as Hostel → Floor → Room → Bed, with its occupant and status. You can filter by hostel, floor, room type, capacity, gender and free beds. |
| **Allocation engine** | Allocates beds inside a MySQL transaction with `SELECT … FOR UPDATE` locks. It checks admission approval, gender, room and bed status and capacity. Suggested beds are ranked by preference and by roommates from the same year and department. |
| **Room transfer & exit** | A transfer keeps the old allocation as history. Exit goes through request → room inspection → fee verification → clearance → bed release, all in one transaction. |
| **Admissions** | Application with document uploads → document verification → eligibility checks (advisory) → approve/reject → fee assignment → allocation → confirmation. Every status transition is stored. |
| **Attendance** | Roll call per hostel, floor and room. Approved leave turns an absence into *On leave*, and a check-in after the cut-off becomes *Late*. A student can't be marked twice for the same date. |
| **Exception Center** | Flags absent today, repeated absence, low monthly attendance, absent despite approved leave, not marked, and overdue from leave. Each exception goes through investigate → resolve. |
| **Leave** | Apply (with an optional document), approve or reject, record departure and return. Overlapping leave and invalid date ranges are rejected. Returns that pass the grace period are detected automatically. |
| **Complaints** | Auto-assigned to the matching-skill staff member with the lowest workload. Each priority has an SLA (4/12/24/72 h). A breached complaint escalates staff → warden → administrator. The student sees the full lifecycle and confirms the fix (with a rating) or reopens it. Category and priority suggestions use keyword rules, not AI. |
| **Maintenance** | Putting a room into maintenance blocks allocation, notifies the occupants and creates a task. Completing the task reactivates the room. |
| **Fees** | Fee structures and a per-student ledger. Status (Paid, Partial, Pending, Overdue) is derived at query time, so it never goes stale. Payments are recorded in transactions that reject overpayment and duplicate transaction IDs. Fee Risk Alerts cover overdue, due this week, partial payments and repeat defaulters. |
| **Visitors** | Gate register with ID proof and returning-visitor lookup. Students can pre-register visitors. Visiting hours are enforced, and an override needs remarks. The database prevents the same visitor from being checked in twice. |
| **Security Desk** | Answers "who is currently inside?": students inside, students on leave, overdue returns, visitors inside and expected visitors. |
| **Parent portal** | Parents and guardians get a read-only login linked to one or more children (siblings share one account). They see where the child is today, room and roommates, a monthly attendance calendar, the fee ledger with payments, leave history with gate departure and return times, activities, complaints and visitors. They are notified when leave is approved or rejected, when the child leaves or returns, when a return is overdue and when a fee becomes overdue. Wardens link or unlink parents from the student page. |
| **Student self-service** | Students see their room, roommates, attendance calendar, fee ledger, complaints, leave, visitors, application tracking, activities and announcements. They can edit only their contact details. |
| **Departments** | Engineering departments (B.E./B.Tech./M.E.) with HoD, block, intake and university branch code, plus residency statistics. |
| **Reports** | Daily Hostel Status, plus student, department, occupancy, allocation, attendance, leave, complaint, maintenance, fee, payment, visitor and exit reports. Each exports to **CSV, Excel and PDF**. |
| **Notifications & audit** | A navbar bell with an unread count. Every important action is recorded in a read-only audit log, enforced by MySQL triggers. |
| **Policies** | The administrator configures SLA hours, attendance thresholds, grace periods, visiting hours and the optional *"overdue fees block leave"* policy. |

**Hostel Health Score** is an operational indicator, not a disciplinary score. It is a weighted mix of attendance (7 days), complaint SLA (30 days), fee collection, maintenance, occupancy and on-time leave returns.

## Architecture

```
Hostel/
├── backend/                     Express API
│   ├── db/
│   │   ├── schema.sql           37 tables, FKs, CHECKs, generated-column unique keys
│   │   ├── triggers.sql         audit_logs + payments are immutable
│   │   ├── setup.js             create DB + apply schema (npm run db:setup)
│   │   └── seed.js              DEMO data (npm run db:seed)
│   ├── src/
│   │   ├── app.js / server.js
│   │   ├── config/              env, db pool + transaction helper, roles & permissions
│   │   ├── middleware/          auth (JWT + RBAC), validate (zod), upload (multer + magic bytes), error
│   │   ├── services/            audit, notify, settings (policies)
│   │   ├── jobs/scheduler.js    SLA escalation, overdue returns, fee alerts, exception scans
│   │   ├── modules/<feature>/   routes (+ service) per module
│   │   └── utils/               list (pagination/sort/filter), scope (hostel scoping), errors
│   └── tests/                   node:test + supertest workflows against <DB_NAME>_test
└── frontend/                    React + Vite
    └── src/
        ├── components/ui        Button, Field, Modal/Drawer/ConfirmDialog, DataTable, Badge, Card, States…
        ├── components/charts    Recharts wrappers
        ├── context/             AuthContext
        ├── features/<module>/   pages per module
        ├── hooks/               useFetch, useListState (URL-synced filters), useAction, lookups
        ├── layouts/ routes/ services/ utils/ validations/
```

**Data integrity is enforced in MySQL as well as in code:**

| Rule | How |
|---|---|
| One bed → at most one active student | `UNIQUE(active_bed_id)` where `active_bed_id = IF(status='active', bed_id, NULL)` |
| One student → at most one active allocation | `UNIQUE(active_student_id)` (same technique) |
| Occupancy ≤ capacity | `CHECK (current_occupancy <= capacity)` plus row locks in the allocation transaction |
| One attendance record per student per day | `UNIQUE(student_id, attendance_date)` |
| Unique payment transaction ID | `UNIQUE(transaction_id)`. Payments cannot be updated (trigger). |
| Valid leave date range | `CHECK (to_date >= from_date)` |
| Paid amount never exceeds the fee | `CHECK (amount_paid <= total_amount - discount)` |
| One visitor inside at a time | `UNIQUE(inside_visitor_id)` |
| One open application / exit per student | generated-column unique keys |

Transactions cover allocation, transfer, vacate, exit clearance, payment recording, attendance marking and every status workflow. The audit entry for each change is written inside the same transaction.

Wardens, staff and security only see their assigned hostels (`user_hostels`). Students only see their own records.

## Installation & running

**Prerequisites:** Node.js 20+ (tested on 24) and MySQL 8.0.16+ running locally.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # then set DB_PASSWORD and JWT_SECRET (a ready .env is included for local dev)
npm run db:reset              # creates the database, applies schema + triggers, loads demo data
npm run dev                   # API on http://localhost:5000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # UI on http://localhost:5173 (proxies /api to the backend)
```

Open http://localhost:5173. In development the login page shows one-click demo accounts.

| Script (backend) | Purpose |
|---|---|
| `npm run dev` | Start the API with auto-reload (nodemon) |
| `npm start` | Start the API (production) |
| `npm run db:setup` | Create the database and apply the schema (no-op if tables exist) |
| `npm run db:seed` | Load demo data into an empty database |
| `npm run db:reset` | Drop, recreate and seed (**destroys data**) |
| `npm run db:migrate` | Upgrade an existing database in place (adds new tables such as `parent_students`, syncs roles and permissions). No data loss. |
| `npm test` | Run the workflow test suite against `<DB_NAME>_test` |

## Environment variables

**backend/.env**

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | development | `production` hides dev-only responses (e.g. the reset link) |
| `PORT` | 5000 | |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | localhost / 3306 / root / – / hostel_erp | |
| `JWT_SECRET` | – | **Required.** At least 32 characters in production |
| `JWT_EXPIRES_IN` | 8h | |
| `CORS_ORIGIN` | http://localhost:5173 | Comma-separated list |
| `FRONTEND_URL` | http://localhost:5173 | Used in password-reset links |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | uploads / 2 | PDF/JPG/PNG only, verified by file signature |
| `JOBS_ENABLED` / `JOBS_INTERVAL_MINUTES` | true / 10 | Background automation |

**frontend/.env**: `VITE_API_URL` (default `/api`) and `VITE_PROXY_TARGET` (dev proxy target).

No secrets reach the frontend. Password hashes, tokens and DB credentials never leave the server.

## Database setup & seed data

`npm run db:reset` builds `hostel_erp` and loads **development/demo data**. All names, phone numbers and records are fictitious, and the demo institute is labelled *Demo Institute of Engineering & Technology*. Dates are generated relative to *today*, so the dashboards always show live exceptions.

- **50 students** across 8 departments: CSE, IT, ECE, EEE, MECH, CIVIL, AI&DS (B.E./B.Tech.) and M.E. CSE. Register numbers follow the Anna University format (`7111` + batch year + branch code + serial, e.g. `711123104001`). Each student has a year, semester, section, batch, quota, CGPA, faculty advisor, scholarship, guardian and medical details.
- 44 residents across **3 hostels** (2 boys, 1 girls; 8 floors, 23 rooms, 61 beds). One room is under maintenance and one bed is blocked. There is one transfer in the history, one cleared exit and one pending exit.
- Applications at every stage: submitted, eligible, approved, fee assigned and confirmed, with demo PDF documents.
- 30 days of attendance, current and overdue leave, 16 complaints (some SLA-breached and escalated), maintenance tasks, three fee structures with full, partial and unpaid payments (including repeat defaulters), visitors inside, expected and checked out, plus activities and announcements.
- **1 super admin, 2 wardens, 4 staff, 2 security staff.**

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@demo.college.edu | Admin@123 |
| Warden (boys A & B) | warden.boys@demo.college.edu | Warden@123 |
| Warden (girls) | warden.girls@demo.college.edu | Warden@123 |
| Staff | electrician@ · plumber@ · caretaker@ · network@demo.college.edu | Staff@123 |
| Security | security.boys@ · security.girls@demo.college.edu | Security@123 |
| Student (any of 50) | e.g. arun.104001@demo.college.edu | Student@123 |
| Parent (any of 50) | parent.&lt;register number&gt;@demo.college.edu, e.g. parent.711123104001@ (parent of Arun **and** Harini) | Parent@123 |

> Change or remove these accounts before any real deployment.

## User roles

Permissions are stored in `roles` / `permissions` / `role_permissions` and defined in `backend/src/config/permissions.js`.

| Role | Can |
|---|---|
| **Super Admin** | Everything: users, hostels, rooms, departments, students, fee structures, policies, reports, audit logs. Sees all hostels. |
| **Hostel Warden** | Manage assigned hostels: admissions, allocation and transfer, exits, attendance and exceptions, leave approval, complaints (assign), maintenance, payments, visitors, announcements and activities, reports. |
| **Hostel Staff** | Mark attendance, work on assigned complaints, record maintenance, record visitors, record leave returns. |
| **Security Staff** | Visitor entry and exit, the Security Desk (students inside or on leave, overdue returns), leave departure and return at the gate. |
| **Student** | Apply for hostel, view room, attendance, fees, raise complaints, apply for leave, pre-register visitors, join activities, view announcements, edit contact details. |
| **Parent / Guardian** | Read-only view of linked children only: hostel stay, attendance, fees and payments, leave, activities, complaints, visitors; announcements for everyone; notifications. |

## API documentation

All endpoints are under `/api`. They need `Authorization: Bearer <token>` except login, forgot-password and reset-password. Responses look like this:

```json
{ "success": true, "data": { … }, "meta": { "page": 1, "limit": 20, "total": 44, "pages": 3 } }
{ "success": false, "message": "Bed is already occupied", "code": "BED_ALREADY_OCCUPIED" }
```

List endpoints accept `page`, `limit`, `search`, `sort`, `order=asc|desc`, `from`, `to` and module-specific filters.

<details><summary><b>Auth & users</b></summary>

| Method | Path | Description |
|---|---|---|
| POST | /auth/login | `{email, password}` → `{token, user}`. Locks the account after 5 failures. Rate limited. |
| POST | /auth/logout | Revokes all tokens issued to the user |
| GET | /auth/me | Current user with permissions and hostel scope |
| POST | /auth/forgot-password | `{email}`. Always returns 200. In dev, returns `devResetLink`. |
| POST | /auth/reset-password | `{token, password}` |
| POST | /auth/change-password | `{currentPassword, newPassword}` |
| GET/POST | /users | List / create staff accounts (admin) |
| PUT | /users/:id | Update a user's role, details and hostel assignment |
| PATCH | /users/:id/status | `{status: active\|inactive\|locked}` |
| POST | /users/:id/reset-password | Set a temporary password |
| GET | /users/staff?hostelId= | Staff directory with open workload |
| GET | /users/roles | Roles with permission and user counts |
</details>

<details><summary><b>Hostels, rooms, beds, departments</b></summary>

| Method | Path | Description |
|---|---|---|
| GET/POST | /hostels | List with live stats / create (admin) |
| GET/PUT | /hostels/:id | Detail with floors, staff and health score / update |
| GET/POST | /hostels/:id/floors | Floors |
| GET | /rooms | `hostelId, floorId, status, roomType, hasVacancy` |
| GET | /rooms/available | Rooms with free beds (`gender, roomType`) |
| POST | /rooms | Create a room plus one bed per capacity slot (`A-1-203-B2` codes) |
| PUT | /rooms/:id | Type, capacity (cannot go below occupancy), amenities |
| PATCH | /rooms/:id/status | `{status, reason, createMaintenanceTask}`. Blocks free beds and notifies occupants. |
| GET | /rooms/:id, /rooms/:roomId/beds | Beds with occupants, history, maintenance |
| GET | /beds/available | Free beds (`hostelId, gender, roomType`) |
| GET | /beds/map | Live Bed Map hierarchy with summary |
| PATCH | /beds/:id/status | Available / reserved / maintenance / blocked (never occupied) |
| GET/POST/PUT | /departments | Departments with residency statistics |
</details>

<details><summary><b>Students, admissions, allocation, exit</b></summary>

| Method | Path | Description |
|---|---|---|
| GET | /students | `search, departmentId, year, hostelId, room, hostelStatus, gender, batch` |
| GET | /students/lookup | Minimal picker search (also available to gate staff) |
| GET | /students/:id, /students/me | 360° view: profile, room, fees, attendance, leave, complaints, transfers, visitors |
| POST/PUT | /students, /students/:id | Create (creates the login account) / update |
| PUT | /students/me/profile | Students edit contact, guardian and medical fields only |
| PATCH | /students/:id/status | `{hostelStatus?, accountStatus?, reason}`. Workflow-owned states are protected. |
| POST | /applications | multipart: `reason, preferredHostelId, preferredRoomType, needsAc`, files `id_proof, admission_letter, …` |
| GET | /applications, /applications/:id | With documents, history, eligibility checks, allowed transitions |
| PATCH | /applications/:id/verify-documents · /eligibility · /decision · /confirm · /cancel | Workflow steps |
| GET | /applications/documents/:docId/download | Authorised download |
| POST | /allocations | `{studentId, bedId}`. Errors: `BED_ALREADY_OCCUPIED`, `STUDENT_ALREADY_ALLOCATED`, `ADMISSION_NOT_APPROVED`, `ROOM_FULL`, `ROOM_NOT_ACTIVE`, `GENDER_MISMATCH` |
| GET | /allocations/suggest?studentId= | Ranked bed suggestions with reasons |
| GET | /allocations/pending | Approved students awaiting a bed |
| GET | /allocations, /allocations/history | Active allocations / full history plus transfers |
| POST | /allocations/:id/transfer | `{newBedId, reason}` |
| POST | /allocations/:id/vacate | `{reason}` |
| POST/GET | /exits | Request exit / list |
| PATCH | /exits/:id/inspect · /clear · /reject · /cancel | Inspection, then clearance (fee check, `PENDING_DUES`, bed release) |
</details>

<details><summary><b>Attendance, leave</b></summary>

| Method | Path | Description |
|---|---|---|
| GET | /attendance/roster?hostelId&date | Residents with existing marks and leave flags |
| POST | /attendance | `{hostelId, date, overwrite, records:[{studentId,status,checkInTime,remarks}]}`. Errors: `DUPLICATE_ATTENDANCE`, `INVALID_STUDENT`, `INVALID_DATE` |
| GET | /attendance | Records (filters) |
| GET | /attendance/summary | Daily trend |
| GET | /attendance/student/:studentId?month= | Calendar + percentage |
| GET | /attendance/exceptions?date&hostelId | Exception Center (runs the scan) |
| PATCH | /attendance/exceptions/:id | `{status, notes}` |
| POST | /leaves | multipart with optional `document`. Errors: `LEAVE_OVERLAP`, `NOT_A_RESIDENT`, `FEES_OVERDUE_POLICY` |
| GET | /leaves | `status, overdue=true, current=true, hostelId, leaveType, from, to` |
| GET | /leaves/:id, /leaves/:id/document | Detail with history |
| PATCH | /leaves/:id/approve · /reject · /cancel · /depart · /return | Workflow |
</details>

<details><summary><b>Complaints, maintenance</b></summary>

| Method | Path | Description |
|---|---|---|
| POST | /complaints | `{category, priority, title, description}`. Auto-assigns and sets the SLA. |
| POST | /complaints/suggest | `{text}` → keyword-rule category/priority suggestion |
| GET | /complaints | `status, open, category, priority, hostelId, assignedTo, sla=breached\|due_today\|on_track, from, to` |
| GET | /complaints/:id | Timeline, assignments, allowed transitions for the caller |
| PATCH | /complaints/:id/assign | `{assignedTo, note}` |
| PATCH | /complaints/:id/status | `{status, note, rating?, feedback?}`. The student closes with a rating or reopens. |
| POST | /complaints/:id/notes | Add a note |
| GET/POST | /maintenance | List / create (`blocksRoom` puts the room into maintenance) |
| PATCH | /maintenance/:id | `{status, assignedTo, notes, cost}`. Completion reactivates the room. |
</details>

<details><summary><b>Fees, payments</b></summary>

| Method | Path | Description |
|---|---|---|
| GET/POST/PUT | /fees/structures | Fee structures (amounts lock once assigned) |
| GET | /fees | Ledger + totals: `search, status, departmentId, hostelId, academicYear, from, to (due)` |
| POST | /fees | Assign: `{feeStructureId, studentIds? \| allResidents, discount}` |
| GET | /fees/alerts | Overdue, due soon, partial, repeat defaulters |
| POST | /fees/:id/adjust | Discount / waiver / due date (audited) |
| GET | /fees/ledger/:studentId | Full ledger + payments |
| POST | /payments | `{studentFeeId, amount, paymentMode, transactionId, paidAt?}`. Errors: `OVERPAYMENT`, `DUPLICATE_TRANSACTION`, `FEE_ALREADY_PAID` |
| GET | /payments, /payments/:studentId | Payment register / student history |
</details>

<details><summary><b>Parent portal</b></summary>

| Method | Path | Description |
|---|---|---|
| GET | /parents/children | Parent: one summary per linked child (whereabouts today, room, attendance %, fee due, pending leave, open complaints, warden contact) |
| GET | /parents/children/:studentId | Parent: full read-only view (stay, fees + payments, leave, activities, complaints, visitors). Other students → 403. |
| GET | /parents/children/:studentId/attendance?month= | Parent: monthly attendance calendar |
| GET | /parents/student/:studentId | Warden/admin: parents linked to a student |
| POST | /parents/link | Warden/admin: `{studentId, name, email, phone?, relation, password?}`. Links an existing parent login or creates one (returns a temporary password). Errors: `ALREADY_LINKED`, `EMAIL_EXISTS` |
| DELETE | /parents/link/:parentUserId/:studentId | Warden/admin: unlink (the login stays for other children) |
</details>

<details><summary><b>Visitors, dashboards, other</b></summary>

| Method | Path | Description |
|---|---|---|
| POST | /visitors | Register or pre-register. Use `checkInNow`, plus `override` + `remarks` outside visiting hours. |
| POST | /visitors/:id/check-in · /check-out · /cancel | Errors: `VISITOR_ALREADY_INSIDE`, `OUTSIDE_VISITING_HOURS`, `STUDENT_ON_LEAVE` |
| GET | /visitors/current, /visitors, /visitors/lookup?phone= | Inside now / register / returning visitor |
| GET | /dashboard/command (= /admin, /warden) | Command Center: KPIs, exceptions, actions, charts, health |
| GET | /dashboard/actions | Action Center |
| GET | /dashboard/student · /security · /staff | Role dashboards |
| GET/POST/PATCH/DELETE | /activities, /activities/:id/register, /activities/:id/status | Activities |
| GET/POST/DELETE | /announcements | Important and urgent announcements notify the audience |
| GET/PATCH | /notifications, /notifications/count, /:id/read, /read-all | Notifications |
| GET | /reports, /reports/daily-status, /reports/:type?format=json\|csv\|xlsx\|pdf | Reports |
| GET | /audit, /audit/facets | Read-only audit trail |
| GET/PUT | /settings | Policies |
| POST | /settings/run-jobs | Run the automation now |
</details>

## Testing

```bash
cd backend && npm test
```

The suite rebuilds an isolated database (`hostel_erp_test`), loads the demo seed and runs **46 workflow tests** through the real API:

- **Auth:** correct login, wrong password, missing token, expired token, role restrictions, hostel scoping.
- **Allocation:** available bed, occupied bed, duplicate allocation, unapproved student, maintenance room, gender mismatch, a **concurrent race for the same bed** (exactly one wins), occupancy consistency, transfer with history.
- **Attendance:** marking, duplicates, invalid student, future date, leave integration, monthly percentage.
- **Leave:** invalid range, overlap, approval with notification, rejection, overdue detection and return.
- **Complaints:** creation with SLA and skill-based assignment, invalid transitions, resolve, then student confirmation, SLA breach escalation.
- **Fees:** partial, duplicate transaction, overpayment, full payment, overdue listing, payment immutability.
- **Visitors:** check-in, duplicate check-in, current list, check-out. **Audit:** entries recorded and the DB refuses deletes.
- **Parent portal:** lists only linked children, full child view, blocked from other students and staff screens, notified on leave approval, warden linking with duplicate and out-of-scope refusals.

## Production build & deployment

```bash
cd frontend && npm run build          # outputs frontend/dist
cd backend  && NODE_ENV=production npm start
```

Deployment checklist:
- Serve `frontend/dist` from a static host or reverse proxy (Nginx/Caddy). Route `/api` to the Node process and fall back to `index.html` for client-side routes.
- Set `NODE_ENV=production`, a long random `JWT_SECRET`, `CORS_ORIGIN` and `FRONTEND_URL`, and use a dedicated MySQL user with least privilege instead of `root`.
- Run the API under a process manager (PM2/systemd) behind HTTPS. `trust proxy` is enabled for correct client IPs.
- Put `UPLOAD_DIR` on persistent storage and back it up together with the database.
- Connect a mail service in `auth.routes.js` (forgot-password) and remove or rotate the demo accounts.
- Background jobs run inside the API process. With several API instances, set `JOBS_ENABLED=false` on all but one.

### Future AI integration

The rule-based complaint suggestion (`complaints.service.js → suggest`) and the exception scans are deliberately transparent heuristics, not AI. They are isolated functions, so a trained classifier or an occupancy forecast can replace them later without changing the API.
