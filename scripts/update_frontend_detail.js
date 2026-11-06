const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../frontend/src/features/complaints/ComplaintDetailPage.jsx');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add Camera, Image, ExternalLink, X to imports
code = code.replace(
  "import { Star, UserPlus, Play, CheckCircle2, RotateCcw, XCircle, MessageSquare, Hammer, Clock } from 'lucide-react';",
  "import { Star, UserPlus, Play, CheckCircle2, RotateCcw, XCircle, MessageSquare, Hammer, Clock, Camera, Image, X, ExternalLink } from 'lucide-react';"
);

// 2. Add AddPhotoModal and ResolveWithProofModal
const modalsCode = `
function AddPhotoModal({ c, onClose, onDone }) {
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [type, setType] = useState('complaint');
  const [pending, setPending] = useState(false);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 3) { toast.error('Max 3 images'); return; }
    const valid = files.filter((f) => ['image/jpeg', 'image/png'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (valid.length < files.length) toast.error('Only JPG/PNG images under 5MB allowed');
    const next = [...images, ...valid].slice(0, 3);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const remove = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    if (!images.length) { toast.error('Please select at least one photo'); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.append('attachmentType', type);
      images.forEach((img) => fd.append('images', img));
      await api.post(\`/complaints/\${c.id}/attachments\`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(\`Added \${images.length} photo(s)\`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Add Photo Proof"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!images.length}>Upload</Button></>}>
      <div className="space-y-4">
        <Select label="Photo type" value={type} onChange={(e) => setType(e.target.value)}
          options={[
            { value: 'complaint', label: 'Complaint Photo' },
            { value: 'before', label: 'Before Work Photo' },
            { value: 'after', label: 'Resolution Proof Photo' },
          ]} />
        <div>
          <label className="label mb-1 block">Select photos (max 3)</label>
          <div className="flex flex-wrap items-center gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded border border-slate-200 bg-slate-50">
                <img src={src} alt="Preview" className="h-full w-full object-cover" />
                <button type="button" onClick={() => remove(i)} className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
                <Camera className="h-4 w-4 text-slate-400" />
                <span className="text-[9px] text-slate-500">Upload</span>
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFiles} />
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ResolveWithProofModal({ c, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [pending, setPending] = useState(false);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 3) { toast.error('Max 3 images'); return; }
    const valid = files.filter((f) => ['image/jpeg', 'image/png'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (valid.length < files.length) toast.error('Only JPG/PNG images under 5MB allowed');
    const next = [...images, ...valid].slice(0, 3);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const remove = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    if (!note.trim()) { toast.error('Please enter what was done'); return; }
    setPending(true);
    try {
      let body;
      let headers;
      if (images.length > 0) {
        const fd = new FormData();
        fd.append('status', 'resolved');
        fd.append('note', note.trim());
        images.forEach((img) => fd.append('images', img));
        body = fd;
        headers = { 'Content-Type': 'multipart/form-data' };
      } else {
        body = { status: 'resolved', note: note.trim() };
      }
      await api.patch(\`/complaints/\${c.id}/status\`, body, { headers });
      toast.success('Marked as resolved');
      onDone();
    } catch (err) { toast.error(err.message); } finally { setPending(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Mark as resolved" description="The student will be asked to confirm the fix."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" onClick={submit} loading={pending}>Resolve</Button></>}>
      <div className="space-y-4">
        <Textarea label="What was done?" required placeholder="e.g. Capacitor replaced, tested and running normally." value={note} onChange={(e) => setNote(e.target.value)} />
        <div>
          <label className="label mb-1 block">Resolution proof photos (optional, max 3)</label>
          <div className="flex flex-wrap items-center gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded border border-slate-200 bg-slate-50">
                <img src={src} alt="Proof" className="h-full w-full object-cover" />
                <button type="button" onClick={() => remove(i)} className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
                <Camera className="h-4 w-4 text-slate-400" />
                <span className="text-[9px] text-slate-500">Proof photo</span>
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFiles} />
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
`;

code = code.replace("function ConfirmResolution({ c, onClose, onDone }) {", modalsCode + "\nfunction ConfirmResolution({ c, onClose, onDone }) {");

// 3. Add previewImg state in ComplaintDetailPage
code = code.replace(
  "  const [modal, setModal] = useState(null);\n  const [pending, setPending] = useState(false);",
  "  const [modal, setModal] = useState(null);\n  const [pending, setPending] = useState(false);\n  const [previewImg, setPreviewImg] = useState(null);"
);

// 4. Add "Add photos" button to action bar if allowed
const oldActionBar = `          {!['closed', 'rejected'].includes(c.status) && <Button size="sm" variant="ghost" icon={MessageSquare} onClick={() => setModal('note')}>Add note</Button>}`;
const newActionBar = `          {!['closed', 'rejected'].includes(c.status) && <Button size="sm" variant="ghost" icon={Camera} onClick={() => setModal('photo')}>Add photos</Button>}
          {!['closed', 'rejected'].includes(c.status) && <Button size="sm" variant="ghost" icon={MessageSquare} onClick={() => setModal('note')}>Add note</Button>}`;
code = code.replace(oldActionBar, newActionBar);

// 5. Add Attachments card before Activity Log card
const oldActivityCard = `          <Card title="Activity log" icon={Clock}>`;
const attachmentsCard = `          {c.attachments && c.attachments.length > 0 && (
            <Card title={\`Photo Proof & Attachments (\${c.attachments.length})\`} icon={Image}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {c.attachments.map((att) => {
                  const isResolution = att.attachment_type === 'after';
                  const isBefore = att.attachment_type === 'before';
                  return (
                    <div
                      key={att.id}
                      onClick={() => setPreviewImg(att)}
                      className="group relative cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm transition hover:shadow-md"
                    >
                      <img src={att.url} alt={att.original_name} className="h-28 w-full object-cover transition duration-200 group-hover:scale-105" />
                      <div className="p-2">
                        <span className={clsx(
                          'inline-block rounded px-1.5 py-0.5 text-[10px] font-medium',
                          isResolution ? 'bg-emerald-100 text-emerald-800' : isBefore ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        )}>
                          {isResolution ? 'Resolution Proof' : isBefore ? 'Before Work' : 'Complaint Photo'}
                        </span>
                        <p className="mt-1 truncate text-xs text-slate-600" title={att.original_name}>{att.original_name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Activity log" icon={Clock}>`;

code = code.replace(oldActivityCard, attachmentsCard);

// 6. Use ResolveWithProofModal and AddPhotoModal
code = code.replace(
  "<ConfirmDialog open={modal === 'resolve'} onClose={() => setModal(null)} loading={pending} onConfirm={(n) => changeStatus('resolved', n)} tone=\"success\" title=\"Mark as resolved\" message=\"The student will be asked to confirm the fix.\" reasonLabel=\"What was done?\" confirmLabel=\"Resolve\" />",
  `{modal === 'resolve' && <ResolveWithProofModal c={c} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'photo' && <AddPhotoModal c={c} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}`
);

// 7. Add image viewer modal before final closing div
const imgViewerModal = `
      {previewImg && (
        <Modal open onClose={() => setPreviewImg(null)} size="lg" title={previewImg.original_name} description={\`\${previewImg.attachment_type === 'after' ? 'Resolution Proof' : previewImg.attachment_type === 'before' ? 'Before Work' : 'Complaint Photo'} · \${fmtDateTime(previewImg.created_at)}\`}
          footer={<><Button variant="secondary" onClick={() => setPreviewImg(null)}>Close</Button><a href={previewImg.url} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open original</a></>}>
          <div className="flex items-center justify-center overflow-hidden rounded-lg bg-slate-900">
            <img src={previewImg.url} alt={previewImg.original_name} className="max-h-[70vh] max-w-full object-contain" />
          </div>
        </Modal>
      )}
`;

code = code.replace("      {is('student') && <p className=\"text-xs text-slate-400\">", imgViewerModal + "\n      {is('student') && <p className=\"text-xs text-slate-400\">");

fs.writeFileSync(filePath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully updated ComplaintDetailPage.jsx');
