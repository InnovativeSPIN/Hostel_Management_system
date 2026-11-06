const fs = require('fs');
const path = require('path');

// 1. Update frontend/src/validations/schemas.js
const schemasPath = path.join(__dirname, '..', 'frontend', 'src', 'validations', 'schemas.js');
let schemasContent = fs.readFileSync(schemasPath, 'utf8');

if (!schemasContent.includes("'on_duty'")) {
  schemasContent = schemasContent.replace(
    "leaveType: z.enum(['home', 'medical', 'personal', 'academic', 'emergency']),",
    "leaveType: z.enum(['home', 'medical', 'personal', 'academic', 'emergency', 'on_duty']),"
  );
}

if (!schemasContent.includes('visitDate:')) {
  schemasContent = schemasContent.replace(
    "expectedAt: z.string().optional(),",
    "expectedAt: z.string().optional(),\r\n  visitDate: z.string().optional().or(z.literal('')), \r\n  fromTime: z.string().optional().or(z.literal('')), \r\n  toTime: z.string().optional().or(z.literal('')),"
  );
}
fs.writeFileSync(schemasPath, schemasContent, 'utf8');
console.log('schemas.js updated');

// 2. Update frontend/src/features/leaves/MyLeavesPage.jsx
const myLeavesPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'leaves', 'MyLeavesPage.jsx');
let myLeavesContent = fs.readFileSync(myLeavesPath, 'utf8');

if (!myLeavesContent.includes("'on_duty'")) {
  myLeavesContent = myLeavesContent.replace(
    "options={['home', 'medical', 'personal', 'academic', 'emergency'].map((t) => ({ value: t, label: label(t) }))}",
    "options={[\r\n          { value: 'home', label: 'Home Leave' },\r\n          { value: 'medical', label: 'Medical Leave' },\r\n          { value: 'on_duty', label: 'On Duty (OD)' },\r\n          { value: 'academic', label: 'Academic Leave' },\r\n          { value: 'personal', label: 'Personal Leave' },\r\n          { value: 'emergency', label: 'Emergency Leave' },\r\n        ]}"
  );
  fs.writeFileSync(myLeavesPath, myLeavesContent, 'utf8');
  console.log('MyLeavesPage.jsx updated');
}

// 3. Update frontend/src/features/visitors/VisitorForm.jsx
const visitorFormPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'visitors', 'VisitorForm.jsx');
let visitorFormContent = fs.readFileSync(visitorFormPath, 'utf8');

if (!visitorFormContent.includes('visitDate')) {
  visitorFormContent = visitorFormContent.replace(
    "{(!gate || !checkInNow) && <Input label=\"Expected arrival\" type=\"datetime-local\" {...register('expectedAt')} />}",
    `{(!gate || !checkInNow) && (
          <>
            <Input label="Visit date" type="date" {...register('visitDate')} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="From time" type="time" {...register('fromTime')} />
              <Input label="To time" type="time" {...register('toTime')} />
            </div>
            <Input label="Expected arrival (optional)" type="datetime-local" {...register('expectedAt')} />
          </>
        )}`
  );

  visitorFormContent = visitorFormContent.replace(
    "const body = { ...v, studentId: student?.id, expectedAt: v.expectedAt ? v.expectedAt.replace('T', ' ') : undefined, remarks: v.remarks || undefined, checkInNow: gate && v.checkInNow, override: gate && v.override };",
    "const body = { ...v, studentId: student?.id, visitDate: v.visitDate || undefined, fromTime: v.fromTime || undefined, toTime: v.toTime || undefined, expectedAt: v.expectedAt ? v.expectedAt.replace('T', ' ') : undefined, remarks: v.remarks || undefined, checkInNow: gate && v.checkInNow, override: gate && v.override };"
  );
  fs.writeFileSync(visitorFormPath, visitorFormContent, 'utf8');
  console.log('VisitorForm.jsx updated');
}

// 4. Update frontend/src/features/visitors/VisitorsPage.jsx
const visitorsPagePath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'visitors', 'VisitorsPage.jsx');
let visitorsPageContent = fs.readFileSync(visitorsPagePath, 'utf8');

if (!visitorsPageContent.includes('is_overstay')) {
  visitorsPageContent = visitorsPageContent.replace(
    "{ key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },",
    `{ key: 'status', header: 'Status', render: (r) => (
            <div className="flex flex-col gap-1">
              <StatusBadge status={r.status} />
              {r.approval_status === 'pending' && <Badge tone="yellow">Warden Pending</Badge>}
              {r.approval_status === 'rejected' && <Badge tone="red">Rejected</Badge>}
              {(r.is_overstay || r.overstay_flagged) && <Badge tone="red">Overstay</Badge>}
            </div>
          ) },`
  );

  visitorsPageContent = visitorsPageContent.replace(
    "{ key: 'times', header: 'Entry / exit', render: (r) => (r.entry_time ? <span className=\"text-xs\">{fmtDateTime(r.entry_time)}<span className=\"block\">{r.exit_time ? `→ ${fmtDateTime(r.exit_time)}` : <Badge tone={r.minutes_inside > 180 ? 'orange' : 'green'}>Inside {duration(r.minutes_inside)}</Badge>}</span></span> : <span className=\"text-xs text-slate-500\">Expected {fmtDateTime(r.expected_at)}</span>) },",
    `{ key: 'times', header: 'Entry / exit', render: (r) => (
            <span className="text-xs">
              {r.entry_time ? (
                <>
                  {fmtDateTime(r.entry_time)}
                  <span className="block">{r.exit_time ? \`→ \${fmtDateTime(r.exit_time)}\` : <Badge tone={r.is_overstay ? 'red' : 'green'}>Inside {duration(r.minutes_inside)}</Badge>}</span>
                </>
              ) : (
                <>
                  {r.visit_date && r.from_time ? (
                    <span>Slot: {r.visit_date} ({r.from_time.slice(0,5)}–{r.to_time ? r.to_time.slice(0,5) : '...'})</span>
                  ) : (
                    <span>Expected {fmtDateTime(r.expected_at)}</span>
                  )}
                </>
              )}
            </span>
          ) },`
  );
  fs.writeFileSync(visitorsPagePath, visitorsPageContent, 'utf8');
  console.log('VisitorsPage.jsx updated');
}

// 5. Update frontend/src/features/dashboard/StudentDashboard.jsx
const dashPath = path.join(__dirname, '..', 'frontend', 'src', 'features', 'dashboard', 'StudentDashboard.jsx');
let dashContent = fs.readFileSync(dashPath, 'utf8');

if (!dashContent.includes('messMenu')) {
  // Add Utensils, Coffee, Clock, Sparkles icon imports
  dashContent = dashContent.replace(
    "import { BedDouble, CalendarCheck, IndianRupee, MessageSquareWarning, CalendarDays, Megaphone, Trophy, Building2, Phone, ClipboardList, AlertTriangle } from 'lucide-react';",
    "import { BedDouble, CalendarCheck, IndianRupee, MessageSquareWarning, CalendarDays, Megaphone, Trophy, Building2, Phone, ClipboardList, AlertTriangle, Utensils, Coffee, Users, CheckCircle2 } from 'lucide-react';\r\nimport { useState } from 'react';\r\nimport { Modal } from '../../components/ui/Modal';"
  );

  // Add fetch for messMenu and visitors
  dashContent = dashContent.replace(
    "const { data, loading, error, reload } = useFetch('/dashboard/student');",
    "const { data, loading, error, reload } = useFetch('/dashboard/student');\r\n  const { data: menuData } = useFetch('/mess/menu/today');\r\n  const { data: weeklyMenu } = useFetch('/mess/menu/weekly');\r\n  const { data: myVisitors } = useFetch('/visitors', { limit: 5 });\r\n  const [showWeeklyMenu, setShowWeeklyMenu] = useState(false);"
  );

  // Add Today's Mess Menu card before Announcements
  const menuCardCode = `
        {/* Step 5: Today's Mess Menu Card */}
        <Card title="Today's Mess Menu" subtitle={menuData ? \`\${menuData.dayOfWeek} · \${menuData.date}\` : 'Daily specials'} icon={Utensils}
          actions={<button type="button" onClick={() => setShowWeeklyMenu(true)} className="text-xs font-semibold text-brand-600 hover:underline">Weekly Menu →</button>}>
          {menuData && menuData.meals ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {menuData.meals.map((m) => (
                <div key={m.mealType} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                      <Coffee className="h-3.5 w-3.5 text-brand-500" />
                      {m.mealType}
                    </span>
                    {m.isOverride && <Badge tone="orange">Special Menu</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-700 leading-relaxed">{m.items}</p>
                  {m.reason && <p className="mt-1 text-[11px] font-medium text-amber-700">★ {m.reason}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading today's menu...</p>
          )}
        </Card>

        {/* Step 5: Visitor Passes Card */}
        <Card title="My Visitors" icon={Users} actions={<Link to="/my/visitors" className="text-xs font-medium text-brand-600">Passes</Link>}>
          {!myVisitors || myVisitors.data?.length === 0 ? (
            <p className="text-sm text-slate-500">No visitor requests recorded.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {myVisitors.data.slice(0, 4).map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">{v.visitor_name}</span>
                    <span className="block text-[11px] text-slate-500">{v.relationship} · {v.pass_code}</span>
                    {v.visit_date && <span className="block text-[10px] text-brand-600 font-medium">{v.visit_date} ({v.from_time?.slice(0,5)}–{v.to_time?.slice(0,5)})</span>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={v.status} />
                    {v.approval_status === 'pending' && <Badge tone="yellow">Pending</Badge>}
                    {v.approval_status === 'approved' && <Badge tone="green">Approved</Badge>}
                    {(v.is_overstay || v.overstay_flagged) && <Badge tone="red">Overstay</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
`;

  dashContent = dashContent.replace(
    `<Card title="Announcements" icon={Megaphone}`,
    `${menuCardCode}\r\n        <Card title="Announcements" icon={Megaphone}`
  );

  // Add Weekly Menu Modal before end of StudentDashboard
  const weeklyModalCode = `
      {/* Weekly Menu Modal */}
      <Modal open={showWeeklyMenu} onClose={() => setShowWeeklyMenu(false)} size="xl" title="NSCET Hostel Weekly Mess Menu" description="Standard menu served across NSCET hostels (Monday to Sunday)">
        <div className="space-y-4 py-2">
          {weeklyMenu ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                const dayMeals = weeklyMenu.filter((m) => m.day_of_week === day);
                return (
                  <div key={day} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                    <h4 className="border-b border-slate-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">{day}</h4>
                    <div className="mt-2 space-y-2 text-xs">
                      {dayMeals.map((dm) => (
                        <div key={dm.meal_type}>
                          <span className="font-semibold text-slate-700">{dm.meal_type}:</span>
                          <p className="text-slate-600 text-[11px] leading-tight">{dm.items}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading weekly menu...</p>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowWeeklyMenu(false)}>Close</Button>
          </div>
        </div>
      </Modal>
`;

  dashContent = dashContent.replace(
    `</div>\r\n  );\r\n}`,
    `${weeklyModalCode}\r\n    </div>\r\n  );\r\n}`
  );

  fs.writeFileSync(dashPath, dashContent, 'utf8');
  console.log('StudentDashboard.jsx updated');
}
