const fs = require('fs');
const path = require('path');

// 1. Mount /billing in menu.routes.js
const menuRoutesPath = path.join(__dirname, '..', 'backend', 'src', 'modules', 'mess', 'menu.routes.js');
let menuContent = fs.readFileSync(menuRoutesPath, 'utf8');

if (!menuContent.includes('/billing')) {
  menuContent = menuContent.replace(
    'router.use(authenticate);',
    "router.use(authenticate);\r\n\r\n// Step 7: Mess Billing Routes\r\nrouter.use('/billing', require('./billing.routes'));"
  );
  fs.writeFileSync(menuRoutesPath, menuContent, 'utf8');
  console.log('Mounted /billing in menu.routes.js');
}

// 2. Update COALESCE in fees.routes.js
const feesRoutesPath = path.join(__dirname, '..', 'backend', 'src', 'modules', 'fees', 'fees.routes.js');
let feesContent = fs.readFileSync(feesRoutesPath, 'utf8');

if (feesContent.includes('COALESCE(fs2.name, fs.name) AS fee_name')) {
  feesContent = feesContent.replaceAll(
    'COALESCE(fs2.name, fs.name) AS fee_name',
    "COALESCE(fs2.name, fs.name, sf.remarks, 'Mess Bill') AS fee_name"
  );
  fs.writeFileSync(feesRoutesPath, feesContent, 'utf8');
  console.log('Updated fee_name resolution in fees.routes.js');
}
