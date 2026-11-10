# Complete Module, Route & Endpoint Inventory

**Application:** College Hostel Management System (ERP)  
**Total Backend Modules:** 25  
**Total Frontend Pages:** 20+  
**Total Supported Roles:** 6 (Super Admin, Hostel Warden, Staff, Security, Student, Parent)  

---

## 1. Backend REST Modules & Endpoints Catalog

| Module | Route File | Primary Endpoints | Protected Permission |
| :--- | :--- | :--- | :--- |
| **1. Authentication** | `modules/auth/auth.routes.js` | `POST /api/auth/login`<br>`GET /api/auth/me`<br>`POST /api/auth/logout`<br>`POST /api/auth/change-password`<br>`POST /api/auth/forgot-password`<br>`POST /api/auth/reset-password` | Public / Authenticated |
| **2. Users & Roles** | `modules/users/users.routes.js` | `GET /api/users`<br>`POST /api/users`<br>`GET /api/users/:id`<br>`PATCH /api/users/:id`<br>`DELETE /api/users/:id`<br>`POST /api/users/:id/reset-password`<br>`GET /api/users/roles` | `users.manage` |
| **3. Departments** | `modules/departments/departments.routes.js` | `GET /api/departments`<br>`POST /api/departments`<br>`PATCH /api/departments/:id`<br>`DELETE /api/departments/:id` | `departments.manage` |
| **4. Hostels** | `modules/hostels/hostels.routes.js` | `GET /api/hostels`<br>`POST /api/hostels`<br>`GET /api/hostels/:id`<br>`PATCH /api/hostels/:id`<br>`GET /api/hostels/:id/dashboard` | `hostels.view`<br>`hostels.manage` |
| **5. Rooms** | `modules/hostels/rooms.routes.js` | `GET /api/rooms`<br>`POST /api/rooms`<br>`GET /api/rooms/:id`<br>`PATCH /api/rooms/:id`<br>`GET /api/rooms/hostel/:hostelId/map`<br>`POST /api/rooms/:id/maintenance` | `hostels.view`<br>`hostels.manage` |
| **6. Beds** | `modules/hostels/beds.routes.js` | `GET /api/beds`<br>`GET /api/beds/:id`<br>`PATCH /api/beds/:id`<br>`POST /api/beds/:id/block`<br>`POST /api/beds/:id/unblock` | `hostels.view`<br>`hostels.manage` |
| **7. Students** | `modules/students/students.routes.js` | `GET /api/students`<br>`POST /api/students`<br>`GET /api/students/:id`<br>`PATCH /api/students/:id`<br>`GET /api/students/:id/overview`<br>`GET /api/students/search` | `students.view`<br>`students.manage` |
| **8. Applications** | `modules/applications/applications.routes.js` | `POST /api/applications`<br>`GET /api/applications`<br>`GET /api/applications/:id`<br>`POST /api/applications/:id/review`<br>`POST /api/applications/:id/documents`<br>`GET /api/applications/my` | `applications.apply`<br>`applications.review` |
| **9. Allocations** | `modules/allocations/allocations.routes.js` | `GET /api/allocations`<br>`POST /api/allocations`<br>`POST /api/allocations/transfer`<br>`POST /api/allocations/vacate`<br>`GET /api/allocations/history/:studentId` | `allocations.manage` |
| **10. Exits** | `modules/exits/exits.routes.js` | `GET /api/exits`<br>`POST /api/exits/request`<br>`POST /api/exits/:id/inspect`<br>`POST /api/exits/:id/clearance`<br>`GET /api/exits/student/:studentId` | `exits.request`<br>`exits.manage` |
| **11. Attendance** | `modules/attendance/attendance.routes.js` | `GET /api/attendance/roster`<br>`POST /api/attendance`<br>`GET /api/attendance/summary`<br>`GET /api/attendance/exceptions`<br>`POST /api/attendance/exceptions/:id/resolve`<br>`GET /api/attendance/student/:studentId` | `attendance.mark`<br>`attendance.view`<br>`attendance.resolve` |
| **12. Leaves** | `modules/leaves/leaves.routes.js` | `POST /api/leaves`<br>`GET /api/leaves`<br>`GET /api/leaves/:id`<br>`PATCH /api/leaves/:id/approve`<br>`PATCH /api/leaves/:id/reject`<br>`POST /api/leaves/:id/depart`<br>`POST /api/leaves/:id/return`<br>`GET /api/leaves/overdue` | `leaves.apply`<br>`leaves.review`<br>`leaves.mark_return` |
| **13. Complaints** | `modules/complaints/complaints.routes.js` | `POST /api/complaints`<br>`GET /api/complaints`<br>`GET /api/complaints/:id`<br>`POST /api/complaints/:id/assign`<br>`PATCH /api/complaints/:id/status`<br>`POST /api/complaints/:id/notes`<br>`POST /api/complaints/:id/feedback`<br>`GET /api/complaints/sla-breached` | `complaints.create`<br>`complaints.view_all`<br>`complaints.assign`<br>`complaints.work` |
| **14. Maintenance** | `modules/maintenance/maintenance.routes.js` | `POST /api/maintenance`<br>`GET /api/maintenance`<br>`GET /api/maintenance/:id`<br>`PATCH /api/maintenance/:id/assign`<br>`PATCH /api/maintenance/:id/status`<br>`POST /api/maintenance/:id/complete` | `maintenance.view`<br>`maintenance.manage` |
| **15. Fees** | `modules/fees/fees.routes.js` | `GET /api/fees/structures`<br>`POST /api/fees/structures`<br>`POST /api/fees/assign`<br>`GET /api/fees`<br>`GET /api/fees/student/:studentId`<br>`GET /api/fees/defaulters` | `fees.view_all`<br>`fees.manage` |
| **16. Payments** | `modules/fees/payments.routes.js` | `POST /api/payments`<br>`GET /api/payments`<br>`GET /api/payments/:id`<br>`GET /api/payments/receipt/:receiptNumber` | `payments.record`<br>`fees.view_all` |
| **17. Visitors** | `modules/visitors/visitors.routes.js` | `POST /api/visitors`<br>`GET /api/visitors`<br>`GET /api/visitors/active`<br>`POST /api/visitors/:id/checkout`<br>`GET /api/visitors/search` | `visitors.request`<br>`visitors.view`<br>`visitors.manage` |
| **18. Activities** | `modules/activities/activities.routes.js` | `GET /api/activities`<br>`POST /api/activities`<br>`PATCH /api/activities/:id`<br>`POST /api/activities/:id/register`<br>`POST /api/activities/:id/attendance` | `activities.view`<br>`activities.manage` |
| **19. Announcements**| `modules/announcements/announcements.routes.js` | `GET /api/announcements`<br>`POST /api/announcements`<br>`PATCH /api/announcements/:id`<br>`DELETE /api/announcements/:id` | `announcements.view`<br>`announcements.manage` |
| **20. Notifications**| `modules/notifications/notifications.routes.js` | `GET /api/notifications`<br>`PATCH /api/notifications/:id/read`<br>`POST /api/notifications/read-all` | Authenticated |
| **21. Dashboard** | `modules/dashboard/dashboard.routes.js` | `GET /api/dashboard/command-center`<br>`GET /api/dashboard/action-center`<br>`GET /api/dashboard/security`<br>`GET /api/dashboard/staff` | `dashboard.command`<br>`security.dashboard` |
| **22. Reports** | `modules/reports/reports.routes.js` | `GET /api/reports/occupancy`<br>`GET /api/reports/admissions`<br>`GET /api/reports/attendance`<br>`GET /api/reports/fees`<br>`GET /api/reports/complaints`<br>`GET /api/reports/export/:type` (CSV/Excel/PDF) | `reports.view` |
| **23. Audit** | `modules/audit/audit.routes.js` | `GET /api/audit`<br>`GET /api/audit/actions` | `audit.view` |
| **24. Settings** | `modules/settings/settings.routes.js` | `GET /api/settings`<br>`PATCH /api/settings` | `settings.manage` |
| **25. Parents** | `modules/parents/parents.routes.js` | `GET /api/parents/children`<br>`GET /api/parents/children/:studentId`<br>`GET /api/parents/children/:studentId/attendance`<br>`GET /api/parents/student/:studentId`<br>`POST /api/parents/link`<br>`DELETE /api/parents/link/:parentId/:studentId` | `parent.portal`<br>`parents.manage` |

---

## 2. Frontend Features & Navigation Mapping

| Feature Path | Component | Target Role(s) | Primary User Actions |
| :--- | :--- | :--- | :--- |
| `/` | `HomePage` / `CommandCenterPage` | Admin, Warden, Staff, Student, Parent | Displays role-specific operational dashboard & KPIs |
| `/action-center` | `ActionCenterPage` | Admin, Warden | Triage urgent attendance exceptions, SLA breaches, overdue exits |
| `/students` | `StudentsPage` | Admin, Warden, Staff | Search, filter, view roster, open student profile drawer |
| `/students/:id` | `StudentDetailPage` | Admin, Warden | Full 360-degree student view: stay, fee ledger, leaves, parent link |
| `/departments` | `DepartmentsPage` | Admin | Add/edit academic branches & student capacities |
| `/applications` | `ApplicationsPage` | Admin, Warden | Review student admissions, inspect uploaded documents, approve/reject |
| `/allocations` | `AllocationsPage` | Admin, Warden | Allocate beds, execute room transfers, vacate beds |
| `/hostels` | `HostelsPage` | Admin, Warden | Manage hostel blocks, warden assignments, floor layouts |
| `/bed-map` | `BedMapPage` | Admin, Warden | Interactive real-time visual grid of beds (Available/Occupied/Blocked) |
| `/attendance` | `AttendancePage` | Admin, Warden, Staff | Daily bulk roll-call by hostel and floor with late check-in tracking |
| `/attendance/exceptions` | `ExceptionCenterPage`| Admin, Warden | Investigate repeated absentees, overdue returns, and unresolved cuts |
| `/leaves` | `LeavesPage` | Admin, Warden | Review leave requests, approve with remarks, track departure/return |
| `/complaints` | `ComplaintsPage` | Admin, Warden, Staff | Work on ticket lifecycle: assign by skill, add notes, escalate, resolve |
| `/maintenance` | `MaintenancePage` | Admin, Warden, Staff | Schedule structural/plumbing repairs, block rooms, record vendor cost |
| `/fees` | `FeesPage` | Admin, Warden | Assign fees, record cash/online payments, inspect defaulter list |
| `/visitors` | `VisitorsPage` | Admin, Warden, Security | Register visitors, verify identity proofs, grant entry/exit passes |
| `/security` | `SecurityDashboard` | Security Staff | Live gate operations: students currently inside/outside, active visitors |
| `/activities` | `ActivitiesPage` | All Roles | View upcoming cultural/sports events, register participation |
| `/announcements` | `AnnouncementsPage` | All Roles | Read broadcast hostel notices |
| `/reports` | `ReportsPage` | Admin, Warden | Generate custom reports and export to Excel/CSV/PDF |
| `/audit` | `AuditPage` | Super Admin | Inspect immutable cryptographic logs of all system events |
| `/settings` | `SettingsPage` | Super Admin | Configure curfew hours, late thresholds, fee penalties, SLA timers |
| `/profile` | `ProfilePage` | All Roles | Manage personal profile, change password |
| `/my/attendance` | `MyAttendancePage` | Student | Inspect personal monthly presence percentage & calendar |
| `/my/fees` | `MyFeesPage` | Student | Inspect fee dues and download payment receipts |
| `/my/leaves` | `MyLeavesPage` | Student | Apply for leave, attach documents, track approval |
| `/my/visitors` | `MyVisitorsPage` | Student | Pre-register expected guests |
| `/my/application` | `MyApplicationPage` | Student | Track admission status and upload documents |

---

## 3. Role-Permission Matrix

| Permission Code | Super Admin | Warden | Staff | Security | Student | Parent |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `users.manage` | Yes | No | No | No | No | No |
| `settings.manage` | Yes | No | No | No | No | No |
| `audit.view` | Yes | No | No | No | No | No |
| `departments.manage` | Yes | No | No | No | No | No |
| `dashboard.command` | Yes | Yes (Scoped) | No | No | No | No |
| `hostels.view` | Yes | Yes (Scoped) | Yes | Yes | No | No |
| `hostels.manage` | Yes | Yes (Scoped) | No | No | No | No |
| `students.view` | Yes | Yes (Scoped) | Yes | Yes | No | No |
| `students.manage` | Yes | Yes (Scoped) | No | No | No | No |
| `applications.apply` | No | No | No | No | Yes | No |
| `applications.review` | Yes | Yes (Scoped) | No | No | No | No |
| `allocations.manage` | Yes | Yes (Scoped) | No | No | No | No |
| `exits.request` | No | No | No | No | Yes | No |
| `exits.manage` | Yes | Yes (Scoped) | No | No | No | No |
| `attendance.mark` | Yes | Yes (Scoped) | Yes | No | No | No |
| `attendance.view` | Yes | Yes (Scoped) | Yes | Yes | No | No |
| `attendance.resolve` | Yes | Yes (Scoped) | No | No | No | No |
| `leaves.apply` | No | No | No | No | Yes | No |
| `leaves.review` | Yes | Yes (Scoped) | No | No | No | No |
| `leaves.mark_return` | Yes | Yes (Scoped) | Yes | Yes | No | No |
| `complaints.create` | Yes | Yes | Yes | Yes | Yes | No |
| `complaints.assign` | Yes | Yes (Scoped) | No | No | No | No |
| `complaints.work` | Yes | Yes (Scoped) | Yes | No | No | No |
| `maintenance.manage` | Yes | Yes (Scoped) | Yes | No | No | No |
| `fees.view_all` | Yes | Yes (Scoped) | No | No | No | No |
| `fees.manage` | Yes | Yes (Scoped) | No | No | No | No |
| `payments.record` | Yes | Yes (Scoped) | No | No | No | No |
| `visitors.request` | No | No | No | No | Yes | No |
| `visitors.manage` | Yes | Yes (Scoped) | No | Yes | No | No |
| `security.dashboard` | Yes | Yes | No | Yes | No | No |
| `activities.manage` | Yes | Yes (Scoped) | No | No | No | No |
| `announcements.manage`| Yes | Yes (Scoped) | No | No | No | No |
| `reports.view` | Yes | Yes (Scoped) | No | No | No | No |
| `parents.manage` | Yes | Yes (Scoped) | No | No | No | No |
| `parent.portal` | No | No | No | No | No | Yes |

