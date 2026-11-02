import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, Cell,
} from 'recharts';
import { fmtDate, fmtMoney } from '../../utils/format';

// Validated categorical order (blue, orange, aqua) — assigned by entity, never cycled.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const GRID = '#e2e8f0';
const AXIS = { fontSize: 11, fill: '#64748b' };
const tooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.08)' };

export function ChartEmpty() {
  return <div className="flex h-56 items-center justify-center text-sm text-slate-400">No data for this period</div>;
}

/** Stacked bed status per hostel. */
export function OccupancyChart({ data }) {
  if (!data?.length) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="code" tickFormatter={(c) => `Hostel ${c}`} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,.12)' }} labelFormatter={(c, p) => p?.[0]?.payload?.name || c} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="occupied" name="Occupied" stackId="a" fill={SERIES[0]} stroke="#fff" strokeWidth={2} />
        <Bar dataKey="available" name="Available" stackId="a" fill={SERIES[2]} stroke="#fff" strokeWidth={2} />
        <Bar dataKey="unavailable" name="Maintenance / blocked" stackId="a" fill={SERIES[1]} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Daily attendance % (single series, so no legend box). */
export function AttendanceTrend({ data }) {
  if (!data?.length) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d).slice(0, 6)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis domain={[(min) => Math.max(0, Math.floor(min / 10) * 10), 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDate}
          formatter={(v, n, p) => (n === 'percentage' ? [`${v}% (${p.payload.present} present, ${p.payload.absent} absent)`, 'Attendance'] : [v, n])} />
        <Line type="monotone" dataKey="percentage" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for one measure across categories (status-coloured when a row has `color`). */
export function CategoryBars({ data, valueFormatter = (v) => v, height = 220, nameKey = 'name', valueKey = 'value' }) {
  if (!data?.length || data.every((d) => !d[valueKey])) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={valueFormatter} allowDecimals={false} />
        <YAxis type="category" dataKey={nameKey} tick={{ ...AXIS, fill: '#334155' }} axisLine={false} tickLine={false} width={110} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,.12)' }} formatter={(v) => [valueFormatter(v), '']} separator="" />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#334155', formatter: valueFormatter }}>
          {data.map((d) => <Cell key={d[nameKey]} fill={d.color || SERIES[0]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export const moneyShort = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : fmtMoney(v));
