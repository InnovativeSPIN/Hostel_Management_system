const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  // Server sends "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" in local time.
  const s = String(v).replace(' ', 'T');
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (v) => {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};

export const fmtDateTime = (v) => {
  const d = toDate(v);
  return d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
};

export const fmtTime = (v) => {
  if (!v) return '—';
  if (/^\d{2}:\d{2}/.test(v)) {
    const [h, m] = v.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  const d = toDate(v);
  return d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';
};

export const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');
export const fmtPct = (n) => `${Number(n || 0).toFixed(Number(n) % 1 === 0 ? 0 : 1)}%`;

export function timeAgo(v) {
  const d = toDate(v);
  if (!d) return '—';
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  const abs = Math.abs(sec);
  const units = [[86400, 'day'], [3600, 'hour'], [60, 'min']];
  for (const [s, label] of units) {
    if (abs >= s) {
      const n = Math.floor(abs / s);
      return sec >= 0 ? `${n} ${label}${n > 1 ? 's' : ''} ago` : `in ${n} ${label}${n > 1 ? 's' : ''}`;
    }
  }
  return sec >= 0 ? 'just now' : 'in a moment';
}

export function duration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const label = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDaysStr = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const yearLabel = (y) => (y ? `${y}${['th', 'st', 'nd', 'rd'][y] || 'th'} year` : '—');
