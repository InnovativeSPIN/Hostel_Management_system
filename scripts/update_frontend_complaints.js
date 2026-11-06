const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../frontend/src/features/complaints/ComplaintsPage.jsx');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Update lucide-react import
code = code.replace("import { Plus, Lightbulb } from 'lucide-react';", "import { Plus, Lightbulb, Camera, X } from 'lucide-react';");

// 2. Update RaiseComplaint component
const oldRaiseComplaint = `function RaiseComplaint({ onClose, onDone }) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(complaintSchema), defaultValues: { category: 'electrical', priority: 'medium' } });
  const [suggestion, setSuggestion] = useState(null);
  const text = useDebounce(\`\${watch('title') || ''} \${watch('description') || ''}\`.trim(), 500);
  const priority = watch('priority');
  useEffect(() => {
    if (text.length < 8) { setSuggestion(null); return; }
    api.post('/complaints/suggest', { text }).then((r) => setSuggestion(r.data.data)).catch(() => {});
  }, [text]);
  const submit = async (v) => {
    try {
      const { data } = await api.post('/complaints', v);
      toast.success(\`\${data.data.complaintCode} registered\${data.data.assignedTo ? \` · assigned to \${data.data.assignedTo}\` : ''}\`);
      onDone(data.data.id);
    } catch (err) { toast.error(err.message); }
  };
  const differs = suggestion && (suggestion.category !== watch('category') || suggestion.priority !== priority);
  return (
    <Modal open onClose={onClose} size="lg" title="Raise a complaint" description="Your complaint is routed to the right staff member and tracked against a resolution deadline."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="cmp-form" loading={isSubmitting}>Submit</Button></>}>
      <form id="cmp-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Input label="Title" required placeholder="e.g. Ceiling fan not working" error={errors.title?.message} {...register('title')} />
        <Textarea label="Describe the problem" required rows={4} error={errors.description?.message} {...register('description')} />
        {differs && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
            <Lightbulb className="h-4 w-4" />Suggested: <b>{label(suggestion.category)}</b> · <b>{label(suggestion.priority)}</b>
            <span className="text-xs text-amber-700">(keyword rules)</span>
            <Button size="xs" variant="secondary" className="ml-auto" onClick={() => { setValue('category', suggestion.category); setValue('priority', suggestion.priority); }}>Use suggestion</Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" options={CATEGORIES.map((c) => ({ value: c, label: label(c) }))} {...register('category')} />
          <Select label="Priority" hint={\`Target resolution: \${SLA_HINT[priority]}\`} options={['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: label(p) }))} {...register('priority')} />
        </div>
      </form>
    </Modal>
  );
}`;

const newRaiseComplaint = `function RaiseComplaint({ onClose, onDone }) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(complaintSchema), defaultValues: { category: 'electrical', priority: 'medium' } });
  const [suggestion, setSuggestion] = useState(null);
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const text = useDebounce(\`\${watch('title') || ''} \${watch('description') || ''}\`.trim(), 500);
  const priority = watch('priority');

  useEffect(() => {
    if (text.length < 8) { setSuggestion(null); return; }
    api.post('/complaints/suggest', { text }).then((r) => setSuggestion(r.data.data)).catch(() => {});
  }, [text]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 3) {
      toast.error('You can upload a maximum of 3 images');
      return;
    }
    const valid = files.filter((f) => ['image/jpeg', 'image/png'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (valid.length < files.length) {
      toast.error('Only JPG and PNG images under 5MB are allowed');
    }
    const next = [...images, ...valid].slice(0, 3);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const removeImage = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    setImages(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async (v) => {
    try {
      let payload = v;
      let headers = undefined;
      if (images.length > 0) {
        const fd = new FormData();
        Object.entries(v).forEach(([k, val]) => {
          if (val !== undefined && val !== null) fd.append(k, val);
        });
        images.forEach((img) => fd.append('images', img));
        payload = fd;
        headers = { 'Content-Type': 'multipart/form-data' };
      }
      const { data } = await api.post('/complaints', payload, { headers });
      toast.success(\`\${data.data.complaintCode} registered\${data.data.assignedTo ? \` · assigned to \${data.data.assignedTo}\` : ''}\`);
      onDone(data.data.id);
    } catch (err) { toast.error(err.message); }
  };

  const differs = suggestion && (suggestion.category !== watch('category') || suggestion.priority !== priority);
  return (
    <Modal open onClose={onClose} size="lg" title="Raise a complaint" description="Your complaint is routed to the right staff member and tracked against a resolution deadline."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="cmp-form" loading={isSubmitting}>Submit</Button></>}>
      <form id="cmp-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Input label="Title" required placeholder="e.g. Ceiling fan not working" error={errors.title?.message} {...register('title')} />
        <Textarea label="Describe the problem" required rows={4} error={errors.description?.message} {...register('description')} />
        {differs && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
            <Lightbulb className="h-4 w-4" />Suggested: <b>{label(suggestion.category)}</b> · <b>{label(suggestion.priority)}</b>
            <span className="text-xs text-amber-700">(keyword rules)</span>
            <Button size="xs" variant="secondary" className="ml-auto" onClick={() => { setValue('category', suggestion.category); setValue('priority', suggestion.priority); }}>Use suggestion</Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" options={CATEGORIES.map((c) => ({ value: c, label: label(c) }))} {...register('category')} />
          <Select label="Priority" hint={\`Target resolution: \${SLA_HINT[priority]}\`} options={['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: label(p) }))} {...register('priority')} />
        </div>
        <div>
          <label className="label mb-1 block">Photo Proof (Optional, max 3 photos)</label>
          <div className="flex flex-wrap items-center gap-3">
            {previews.map((src, i) => (
              <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
                <img src={src} alt={\`Proof \${i + 1}\`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white hover:bg-slate-900 transition-colors"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-100 transition-colors">
                <Camera className="h-5 w-5 text-slate-400" />
                <span className="mt-1 text-[10px] font-medium text-slate-500">Add Photo</span>
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFileChange} />
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">JPG or PNG, max 5MB each. Useful for damaged items, electrical issues, or repairs.</p>
        </div>
      </form>
    </Modal>
  );
}`;

code = code.replace(oldRaiseComplaint, newRaiseComplaint);

// 3. Update table column in ComplaintsPage
const oldCol = `{ key: 'complaint_code', header: 'Complaint', sortKey: 'created', render: (r) => <span><b>{r.complaint_code}</b> <span className="text-slate-700">{r.title}</span><span className="block text-xs text-slate-500">{label(r.category)} · {timeAgo(r.created_at)}</span></span> },`;

const newCol = `{ key: 'complaint_code', header: 'Complaint', sortKey: 'created', render: (r) => (
              <span>
                <b>{r.complaint_code}</b> <span className="text-slate-700">{r.title}</span>
                {r.attachments_count > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200 ml-1.5">
                    <Camera className="h-3 w-3" />{r.attachments_count}
                  </span>
                )}
                <span className="block text-xs text-slate-500">{label(r.category)} · {timeAgo(r.created_at)}</span>
              </span>
            ) },`;

code = code.replace(oldCol, newCol);

fs.writeFileSync(filePath, code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully updated ComplaintsPage.jsx');
