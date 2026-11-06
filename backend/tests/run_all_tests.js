const { spawnSync } = require('child_process');
const path = require('path');

const steps = [
  { step: 1, file: 'verify_step1.js', desc: 'Admission Quota, CGPA & Photos' },
  { step: 2, file: 'verify_step2.js', desc: 'Student Types (NSCET & NS-CBSE)' },
  { step: 3, file: 'verify_step3.js', desc: 'Blocks, Ground Floor Rooms & Fee Structure V2' },
  { step: 4, file: 'verify_step4.js', desc: 'Layered Admission Flow & Auto Fee Assignment' },
  { step: 5, file: 'verify_step5.js', desc: 'Student Dashboard, Mess Menu, Leave/OD, Visitors' },
  { step: 6, file: 'verify_step6.js', desc: '2-Session Attendance (Morning & Evening)' },
  { step: 7, file: 'verify_step7.js', desc: 'Mess Billing (Student & Staff) with PDF' },
  { step: 8, file: 'verify_step8.js', desc: 'Maintenance & Complaints with Image Proof' },
  { step: 9, file: 'verify_step9.js', desc: 'Exit / Vacate Workflow with Settlement Statement PDF' },
  { step: 10, file: 'verify_step10.js', desc: 'Guest Room Allocation (Zero Fee Guaranteed)' },
];

console.log('================================================================');
console.log('       NSCET-HMS FULL REGRESSION SUITE (STEPS 1 - 10)           ');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

for (const { step, file, desc } of steps) {
  process.stdout.write(`Step ${step.toString().padStart(2)}: ${desc.padEnd(52)} `);
  const result = spawnSync('node', [path.join(__dirname, file)], {
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.status === 0) {
    console.log('[ PASSED ]');
    passed++;
  } else {
    console.log('[ FAILED ]');
    console.error(`--- Failure output for ${file} ---`);
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    failed++;
  }
}

console.log('\n================================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${steps.length})`);
console.log('================================================================');

process.exit(failed > 0 ? 1 : 0);
