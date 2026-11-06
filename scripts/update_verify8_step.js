const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/tests/verify_step8.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const oldStep8 = `    // 8. Test: Complete maintenance request with "after" image proof
    const completeBody = makeMultipart({
      status: 'completed',
      notes: 'Pipe replaced and sealed. Tested with full water pressure.',
      cost: '450',
    }, [
      { fieldname: 'after_images', filename: 'pipe_fixed.png', mimetype: 'image/png', buffer: samplePng },
    ]);`;

const newStep8 = `    // 8. Test: Transition maintenance request to in_progress then completed with "after" image proof
    await fetch(\`\${baseUrl}/maintenance/\${mntId}\`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: \`Bearer \${adminToken}\`,
      },
      body: JSON.stringify({ status: 'in_progress', notes: 'Work in progress' }),
    });

    const completeBody = makeMultipart({
      status: 'completed',
      notes: 'Pipe replaced and sealed. Tested with full water pressure.',
      cost: '450',
    }, [
      { fieldname: 'after_images', filename: 'pipe_fixed.png', mimetype: 'image/png', buffer: samplePng },
    ]);`;

code = code.replace(oldStep8, newStep8);
fs.writeFileSync(filePath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Updated verify_step8.js transition test');
