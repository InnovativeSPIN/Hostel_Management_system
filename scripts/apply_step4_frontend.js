const fs = require('fs');
const path = require('path');

// 1. SettingsPage.jsx
const settingsPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'auth', 'SettingsPage.jsx');
let settingsContent = fs.readFileSync(settingsPath, 'utf8');
if (!settingsContent.includes('feature_')) {
  settingsContent = settingsContent.replace(
    "const GROUPS = [",
    "const GROUPS = [\r\n  ['Feature Flags & Admission Workflow', (k) => k.startsWith('feature_')],"
  );
  fs.writeFileSync(settingsPath, settingsContent, 'utf8');
  console.log('SettingsPage.jsx updated');
}

// 2. MyApplicationPage.jsx
const myAppPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'applications', 'MyApplicationPage.jsx');
let myAppContent = fs.readFileSync(myAppPath, 'utf8');

if (!myAppContent.includes('preferredRoomCategory')) {
  myAppContent = myAppContent.replace(
    "const [form, setForm] = useState({ preferredHostelId: '', preferredRoomType: '', needsAc: false, reason: '' });",
    "const [form, setForm] = useState({ preferredHostelId: '', preferredRoomType: '', preferredRoomCategory: '', needsAc: false, reason: '' });"
  );
  myAppContent = myAppContent.replace(
    `<div className="grid gap-4 sm:grid-cols-3">`,
    `<div className="grid gap-4 sm:grid-cols-4">`
  );
  myAppContent = myAppContent.replace(
    `<Select label="Room type" value={form.preferredRoomType} onChange={(e) => setForm({ ...form, preferredRoomType: e.target.value })} placeholder="No preference" options={['single', 'double', 'triple', 'quad'].map((t) => ({ value: t, label: label(t) }))} />`,
    `<Select label="Room type" value={form.preferredRoomType} onChange={(e) => setForm({ ...form, preferredRoomType: e.target.value })} placeholder="No preference" options={['single', 'double', 'triple', 'quad'].map((t) => ({ value: t, label: label(t) }))} />\r\n          <Select label="Room category" value={form.preferredRoomCategory} onChange={(e) => setForm({ ...form, preferredRoomCategory: e.target.value })} placeholder="No preference" options={[{ value: 'AC Room', label: 'AC Room (Block A, 3-Share)' }, { value: 'Attached Toilet', label: 'Attached Toilet (Block A, 3-Share)' }, { value: 'Normal Room', label: 'Normal Room (Block B, 4-Share)' }]} />`
  );
  myAppContent = myAppContent.replace(
    `{latest.preferred_room_type ? \`, \${label(latest.preferred_room_type)} room\` : ''}`,
    `{latest.preferred_room_type ? \`, \${label(latest.preferred_room_type)} room\` : ''}{latest.preferred_room_category ? \` · \${latest.preferred_room_category}\` : ''}`
  );
  fs.writeFileSync(myAppPath, myAppContent, 'utf8');
  console.log('MyApplicationPage.jsx updated');
}

// 3. ApplicationsPage.jsx
const appsPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'applications', 'ApplicationsPage.jsx');
let appsContent = fs.readFileSync(appsPath, 'utf8');

if (!appsContent.includes('r.preferred_room_category')) {
  appsContent = appsContent.replace(
    `{r.preferred_room_type ? label(r.preferred_room_type) : 'Any room'}{r.needs_ac ? ' · AC' : ''}</span></span> },`,
    `{r.preferred_room_type ? label(r.preferred_room_type) : 'Any room'}{r.needs_ac ? ' · AC' : ''}</span>{r.preferred_room_category && <span className="block text-xs font-semibold text-brand-700">{r.preferred_room_category}</span>}</span> },`
  );
  fs.writeFileSync(appsPath, appsContent, 'utf8');
  console.log('ApplicationsPage.jsx updated');
}

// 4. ApplicationDetailPage.jsx
const appDetailPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'applications', 'ApplicationDetailPage.jsx');
let appDetailContent = fs.readFileSync(appDetailPath, 'utf8');

if (!appDetailContent.includes('preferred_room_category')) {
  // Add imports
  appDetailContent = appDetailContent.replace(
    "import { CheckCircle2, XCircle, FileText, Download, BedDouble, ShieldCheck } from 'lucide-react';",
    "import { CheckCircle2, XCircle, FileText, Download, BedDouble, ShieldCheck, Tag, CreditCard } from 'lucide-react';\r\nimport Modal from '../../components/ui/Modal';\r\nimport { Select } from '../../components/ui/Field';"
  );

  // Add category state in component
  appDetailContent = appDetailContent.replace(
    "const [dialog, setDialog] = useState(null);\r\n  const [pending, setPending] = useState(false);",
    "const [dialog, setDialog] = useState(null);\r\n  const [pending, setPending] = useState(false);\r\n  const [categoryModal, setCategoryModal] = useState(false);\r\n  const [selectedCat, setSelectedCat] = useState('Normal Room');\r\n  const [savingCat, setSavingCat] = useState(false);"
  );

  // Add auto-fee and room category action buttons in reviewer toolbar
  appDetailContent = appDetailContent.replace(
    `{['approved', 'fee_assigned'].includes(app.status) && can('allocations.manage') && <Button size="sm" icon={BedDouble} to={\`/allocations?studentId=\${app.student_id}\`}>Allocate bed</Button>}`,
    `{['approved', 'fee_assigned'].includes(app.status) && can('allocations.manage') && <Button size="sm" icon={BedDouble} to={\`/allocations?studentId=\${app.student_id}\`}>Allocate bed</Button>}\r\n          {reviewer && ['submitted', 'documents_verified', 'eligible', 'approved'].includes(app.status) && <Button size="sm" variant="secondary" icon={Tag} onClick={() => { setSelectedCat(app.preferred_room_category || 'Normal Room'); setCategoryModal(true); }}>Room Category</Button>}\r\n          {reviewer && ['submitted', 'documents_verified', 'eligible', 'approved'].includes(app.status) && !app.allocated_fee_structure_id && <Button size="sm" variant="secondary" icon={CreditCard} onClick={() => act(() => api.post(\`/applications/\${id}/auto-fee\`, { roomCategory: app.preferred_room_category || 'Normal Room' }), 'Fee auto-allocated')}>Auto-Allocate Fee</Button>}`
  );

  // Add room category and fee in DefinitionList
  appDetailContent = appDetailContent.replace(
    "['Room type', app.preferred_room_type ? label(app.preferred_room_type) : 'Any'], ['Needs AC', app.needs_ac ? 'Yes' : 'No'], ['Submitted', fmtDate(app.created_at)],",
    "['Room type', app.preferred_room_type ? label(app.preferred_room_type) : 'Any'], ['Room category', app.preferred_room_category ? <span className=\"font-semibold text-brand-700\">{app.preferred_room_category}</span> : 'Any'], ['Auto Fee', app.feeStructureV2 ? <span className=\"font-medium text-emerald-700\">{app.feeStructureV2.name} (₹{Number(app.feeStructureV2.total_amount).toLocaleString('en-IN')})</span> : (app.status === 'fee_assigned' ? 'Fee assigned' : 'Pending')], ['Needs AC', app.needs_ac ? 'Yes' : 'No'], ['Submitted', fmtDate(app.created_at)],"
  );

  // Add Category modal before closing tag
  const modalCode = `
      <Modal open={categoryModal} onClose={() => setCategoryModal(false)} title="Select Room Category" description="Assign room category (Block A AC / Attached Toilet or Block B Normal)">
        <div className="space-y-4 py-2">
          <Select label="Room Category" value={selectedCat} onChange={(e) => setSelectedCat(e.target.value)}
            options={[
              { value: 'AC Room', label: 'AC Room (Block A, 3 Sharing, ₹85,000)' },
              { value: 'Attached Toilet', label: 'Attached Toilet (Block A, 3 Sharing, ₹75,000)' },
              { value: 'Normal Room', label: 'Normal Room (Block B, 4 Sharing, ₹65,000)' },
            ]} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCategoryModal(false)}>Cancel</Button>
            <Button loading={savingCat} onClick={async () => {
              setSavingCat(true);
              try {
                await api.patch(\`/applications/\${id}/room-category\`, { roomCategory: selectedCat });
                toast.success(\`Room category updated to \${selectedCat}\`);
                setCategoryModal(false);
                reload();
              } catch (err) { toast.error(err.message); } finally { setSavingCat(false); }
            }}>Save Category</Button>
          </div>
        </div>
      </Modal>
`;
  appDetailContent = appDetailContent.replace(
    "{d && <ConfirmDialog open onClose={() => setDialog(null)}",
    `${modalCode}\r\n      {d && <ConfirmDialog open onClose={() => setDialog(null)}`
  );

  fs.writeFileSync(appDetailPath, appDetailContent, 'utf8');
  console.log('ApplicationDetailPage.jsx updated');
}

// 5. AllocationsPage.jsx
const allocPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'allocations', 'AllocationsPage.jsx');
let allocContent = fs.readFileSync(allocPath, 'utf8');
if (!allocContent.includes('r.preferred_room_category')) {
  allocContent = allocContent.replace(
    `{ key: 'pref', header: 'Preference', render: (r) => \`\${r.preferred_hostel || 'Any'} · \${r.preferred_room_type ? label(r.preferred_room_type) : 'any room'}\${r.needs_ac ? ' · AC' : ''}\` },`,
    `{ key: 'pref', header: 'Preference', render: (r) => <span>{\`\${r.preferred_hostel || 'Any'} · \${r.preferred_room_type ? label(r.preferred_room_type) : 'any room'}\${r.needs_ac ? ' · AC' : ''}\`}{r.preferred_room_category && <span className="block text-xs font-semibold text-brand-700">{r.preferred_room_category}</span>}</span> },`
  );
  fs.writeFileSync(allocPath, allocContent, 'utf8');
  console.log('AllocationsPage.jsx updated');
}
