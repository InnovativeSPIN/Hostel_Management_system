const fs = require('fs');
let content = fs.readFileSync('backend/src/app.js', 'utf8');
if (!content.includes('mess:')) {
  content = content.replace(
    "  fees: require('./modules/fees/fees.routes'),",
    "  mess: require('./modules/mess/menu.routes'),\r\n  fees: require('./modules/fees/fees.routes'),"
  );
  fs.writeFileSync('backend/src/app.js', content, 'utf8');
  console.log('Mounted mess routes in backend/src/app.js');
} else {
  console.log('Already mounted');
}
