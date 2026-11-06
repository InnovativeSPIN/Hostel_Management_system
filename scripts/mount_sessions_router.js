const fs = require('fs');
let content = fs.readFileSync('backend/src/modules/attendance/attendance.routes.js', 'utf8');

if (!content.includes('/sessions')) {
  content = content.replace(
    "router.use(authenticate);",
    "router.use(authenticate);\r\n\r\n// Step 6: 2-Session Attendance (Morning and Evening) routes\r\nrouter.use('/sessions', require('./sessions.routes'));"
  );
  fs.writeFileSync('backend/src/modules/attendance/attendance.routes.js', content, 'utf8');
  console.log('Mounted /sessions in attendance.routes.js');
} else {
  console.log('Already mounted');
}
