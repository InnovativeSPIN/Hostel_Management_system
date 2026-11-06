const fs = require('fs');
let content = fs.readFileSync('backend/src/modules/leaves/leaves.routes.js', 'utf8');
if (!content.includes("'on_duty'")) {
  content = content.replace(
    "leaveType: z.enum(['home', 'medical', 'personal', 'academic', 'emergency']),",
    "leaveType: z.enum(['home', 'medical', 'personal', 'academic', 'emergency', 'on_duty']),"
  );
  fs.writeFileSync('backend/src/modules/leaves/leaves.routes.js', content, 'utf8');
  console.log('Updated leaveType in leaves.routes.js');
} else {
  console.log('Already updated');
}
