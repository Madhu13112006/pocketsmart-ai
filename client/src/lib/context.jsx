import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { monthOf, todayIso } from './dates.js';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    let live = true;
    (async () => {
      try {
        const m = await api.get('/meta');
        if (live) setMeta(m);
        try {
          const me = await api.get('/auth/me');
          if (live) setUser(me.user);
        } catch (err) {
          if (err.status !== 401 && live) throw err;
        }
      } catch (err) {
        if (live) setBootError(err.message);
      } finally {
        if (live) setBooting(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setUser(res.user);
  }, []);
  const register = useCallback(async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password });
    setUser(res.user);
  }, []);
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setUser(null); }
  }, []);

  const money = useMemo(() => {
    const c = meta?.currencies?.[user?.currency || 'inr'] || { symbol: '₹', locale: 'en-IN' };
    return (n, decimals = false) => {
      const v = Number(n) || 0;
      const r = decimals ? Math.round(v * 100) / 100 : Math.round(v);
      let body;
      try { body = r.toLocaleString(c.locale, { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 }); } catch { body = String(r); }
      return `${c.symbol}${body}`;
    };
  }, [meta, user?.currency]);

  const value = useMemo(
    () => ({ user, setUser, meta, booting, bootError, login, register, logout, money }),
    [user, meta, booting, bootError, login, register, logout, money],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/* The month the person is looking at, shared by the dashboard and the ledger. */
const MonthContext = createContext(null);
export const useMonth = () => useContext(MonthContext);

export function MonthProvider({ children }) {
  const [today] = useState(todayIso);
  const [month, setMonth] = useState(() => monthOf(todayIso()));
  const value = useMemo(() => ({ today, month, setMonth, isCurrent: month === monthOf(today) }), [today, month]);
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

/** Load data from the API and reload it when `deps` change or `reload()` is called. */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api.get(path).then(
      (data) => { if (live) setState({ data, error: '', loading: false }); },
      (err) => { if (live) setState((s) => ({ data: s.data, error: err.message, loading: false })); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
