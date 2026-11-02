import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * Loads `url` with `params`, re-fetching whenever they change.
 * Returns { data, meta, loading, error, reload, setData }.
 */
export function useFetch(url, params, { enabled = true, keepPrevious = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: enabled && !!url, error: null });
  const key = JSON.stringify(params || {});
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url || !enabled) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null, ...(keepPrevious ? {} : { data: null }) }));
    try {
      const { data } = await api.get(url, { params: JSON.parse(key) });
      if (id === seq.current) setState({ data: data.data, meta: data.meta || null, loading: false, error: null });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error }));
    }
  }, [url, key, enabled, keepPrevious]);

  useEffect(() => { load(); }, [load]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: load, setData };
}

export function useDebounce(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** List state (page, sort, filters, search) for paginated tables, synced to the URL query string. */
export function useListState(initial = {}) {
  const defaultsRef = useRef(initial);
  const read = () => {
    const sp = new URLSearchParams(window.location.search);
    const obj = { page: 1, limit: 20, ...defaultsRef.current };
    sp.forEach((v, k) => { obj[k] = /^(page|limit)$/.test(k) ? Number(v) : v; });
    return obj;
  };
  const [query, setQuery] = useState(read);
  const update = useCallback((patch) => {
    const defaults = defaultsRef.current;
    setQuery((q) => {
      const next = { ...q, ...patch };
      if (!('page' in patch)) next.page = 1;
      Object.keys(next).forEach((k) => { if (next[k] === '' || next[k] === undefined || next[k] === null) delete next[k]; });
      const sp = new URLSearchParams();
      Object.entries(next).forEach(([k, v]) => { if (!(k in defaults && defaults[k] === v) && !(k === 'page' && v === 1) && !(k === 'limit' && v === 20)) sp.set(k, v); });
      const qs = sp.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      return next;
    });
  }, []);
  return [query, update];
}
