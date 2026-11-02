import { useEffect, useState } from 'react';
import api from '../services/api';

// Small cached lookups shared by many filter bars and forms.
const cache = {};
const inflight = {};

function useLookup(key, url) {
  const [data, setData] = useState(cache[key] || []);
  useEffect(() => {
    if (cache[key]) return;
    inflight[key] ||= api.get(url).then((r) => { cache[key] = r.data.data; return cache[key]; }).finally(() => { delete inflight[key]; });
    inflight[key].then(setData).catch(() => {});
  }, [key, url]);
  return data;
}

export const useHostels = () => useLookup('hostels', '/hostels');
export const useDepartments = () => useLookup('departments', '/departments');
export const invalidateLookup = (key) => { delete cache[key]; };

export const hostelOptions = (hostels) => hostels.map((h) => ({ value: h.id, label: h.name }));
export const deptOptions = (depts) => depts.map((d) => ({ value: d.id, label: `${d.short_name} — ${d.degree}` }));
