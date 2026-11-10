const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 100000 : 2000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
}));

app.get('/api/health', (_req, res) => res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }));

const routes = {
  auth: require('./modules/auth/auth.routes'),
  users: require('./modules/users/users.routes'),
  departments: require('./modules/departments/departments.routes'),
  hostels: require('./modules/hostels/hostels.routes'),
  rooms: require('./modules/hostels/rooms.routes'),
  beds: require('./modules/hostels/beds.routes'),
  students: require('./modules/students/students.routes'),
  applications: require('./modules/applications/applications.routes'),
  allocations: require('./modules/allocations/allocations.routes'),
  exits: require('./modules/exits/exits.routes'),
  attendance: require('./modules/attendance/attendance.routes'),
  leaves: require('./modules/leaves/leaves.routes'),
  complaints: require('./modules/complaints/complaints.routes'),
  maintenance: require('./modules/maintenance/maintenance.routes'),
  fees: require('./modules/fees/fees.routes'),
  payments: require('./modules/fees/payments.routes'),
  visitors: require('./modules/visitors/visitors.routes'),
  activities: require('./modules/activities/activities.routes'),
  announcements: require('./modules/announcements/announcements.routes'),
  notifications: require('./modules/notifications/notifications.routes'),
  dashboard: require('./modules/dashboard/dashboard.routes'),
  reports: require('./modules/reports/reports.routes'),
  audit: require('./modules/audit/audit.routes'),
  settings: require('./modules/settings/settings.routes'),
  parents: require('./modules/parents/parents.routes'),
  mess: require('./modules/mess/mess.routes'),
  'guest-rooms': require('./modules/guest_rooms/guest_rooms.routes'),
};
Object.entries(routes).forEach(([path, router]) => app.use(`/api/${path}`, router));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
