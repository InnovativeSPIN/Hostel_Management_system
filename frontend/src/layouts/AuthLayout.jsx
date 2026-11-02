import { Building, CheckCircle2 } from 'lucide-react';

const POINTS = [
  'Live bed availability across every hostel, floor and room',
  'Attendance exceptions, overdue returns and SLA breaches surfaced first',
  'Self-service for students: room, fees, leave, complaints',
];

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-900 via-indigo-900 to-indigo-950 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Building className="h-5 w-5" aria-hidden /></span>
          <span className="text-lg font-bold">Hostel ERP</span>
        </div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Centralise hostel data. Surface problems early.</h2>
          <ul className="mt-6 space-y-3">
            {POINTS.map((p) => <li key={p} className="flex gap-2 text-indigo-100"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden />{p}</li>)}
          </ul>
        </div>
        <p className="text-xs text-indigo-300">Hostel Operations Platform · Engineering College Edition</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden"><span className="text-lg font-bold text-brand-700">Hostel ERP</span></div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
