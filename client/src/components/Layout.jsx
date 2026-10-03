import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp, useMonth } from '../lib/context.jsx';
import { monthLabel, shiftMonth } from '../lib/dates.js';

const TABS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/ledger', label: 'Expenses' },
  { to: '/budget', label: 'Budget' },
  { to: '/goals', label: 'Goals' },
  { to: '/afford', label: 'Can I afford it?' },
  { to: '/planner', label: 'Budget planner' },
];

export default function Layout() {
  const { user } = useApp();
  const { month, setMonth } = useMonth();
  const { pathname } = useLocation();
  const showMonth = pathname === '/' || pathname === '/ledger';
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="wrap">
      <header className="band">
        <div className="band-top">
          <div>
            <Link to="/" className="brand">Pocket<em>Smart</em> AI</Link>
            <div className="tagline">Budget &amp; recommendation assistant</div>
          </div>
          <div className="band-tools">
            {showMonth && (
              <div className="monthnav" role="group" aria-label="Month">
                <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>&#8592;</button>
                <span className="num" aria-live="polite">{monthLabel(month)}</span>
                <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>&#8594;</button>
              </div>
            )}
            <Link to="/account" className="userchip" title="Your account" style={{ textDecoration: 'none' }}>
              <span className="avatar" aria-hidden="true">{initial}</span>
              <span className="tiny muted">{user?.name}</span>
            </Link>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>{t.label}</NavLink>
          ))}
        </nav>
      </header>
      <main className="panel"><Outlet /></main>
      <footer className="foot">
        <p>Recommendations come from an explicit rule set: the 50/30/20 split, burn-rate projection, category headroom, days to payday and a weighted affordability score. Each figure can be traced back to the entries you logged.</p>
        <p>PocketSmart AI is a planning aid and not a substitute for advice from a licensed financial adviser.</p>
      </footer>
    </div>
  );
}
