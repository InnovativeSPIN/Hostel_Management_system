const fs = require('fs');
const path = require('path');

const feesPagePath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'fees', 'FeesPage.jsx');
let content = fs.readFileSync(feesPagePath, 'utf8');

if (!content.includes('MessBilling')) {
  content = "import MessBilling from './MessBilling';\r\n" + content;

  content = content.replace(
    "{ value: 'structures-v2', label: 'Room & Category Fees (V2)' },",
    "{ value: 'mess-billing', label: 'Mess Bills (Students & Staff)' },\r\n        { value: 'structures-v2', label: 'Room & Category Fees (V2)' },"
  );

  content = content.replace(
    "{tab === 'structures-v2' && <StructuresV2 />}",
    "{tab === 'mess-billing' && <MessBilling />}\r\n      {tab === 'structures-v2' && <StructuresV2 />}"
  );

  fs.writeFileSync(feesPagePath, content, 'utf8');
  console.log('MessBilling tab mounted in FeesPage.jsx');
}
