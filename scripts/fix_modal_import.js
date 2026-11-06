const fs = require('fs');
let content = fs.readFileSync('frontend/src/features/applications/ApplicationDetailPage.jsx', 'utf8');
content = content.replace("import Modal from '../../components/ui/Modal';\r\n", '');
content = content.replace("import Modal from '../../components/ui/Modal';\n", '');
content = content.replace("import { ConfirmDialog } from '../../components/ui/Modal';", "import { ConfirmDialog, Modal } from '../../components/ui/Modal';");
fs.writeFileSync('frontend/src/features/applications/ApplicationDetailPage.jsx', content, 'utf8');
console.log('Fixed Modal import');
