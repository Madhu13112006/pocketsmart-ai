import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useApp, useMonth } from '../lib/context.jsx';
import { Alert, Card, KIND_LABEL, Loading, Track, pct } from '../components/ui.jsx';
import { DailyChart, PaceChart } from '../components/Charts.jsx';
import { monthLabel } from '../lib/dates.js';

export default function Dashboard() {
  const { money, user, setUser } = useApp();
  const { month, today, setMonth } = useMonth();
  const { data, error, loading, reload } = useApi(`/dashboard${qs({ month, today })}`);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState('');

  async function loadSample() {
    setSeeding(true); setSeedError('');
    try {
      const res = await api.post('/demo/seed', { today });
      setUser(res.user);
      if (res.month !== month) setMonth(res.month); else reload();
    } catch (e) { setSeedError(e.message); } finally { setSeeding(false); }
  }

  if (!data) return <>{error ? <Alert>{error}</Alert> : <Loading label="Loading your month" />}</>;

  const { metrics: M, categories, insights, cumulative } = data;
  const tiles = [
    { k: 'Income', v: money(M.income), d: `Paid on day ${user.payday}` },
    { k: 'Spent', v: money(M.outflow), d: M.income > 0 ? `${pct((M.outflow / M.income) * 100)} of income` : 'Set your income to compare' },
    { k: 'Put aside', v: money(M.byKind.save), d: `${pct(M.savingsRate)} savings rate`, cls: 'pos' },
    { k: 'Left', v: money(M.left), d: M.upcoming > 0 ? `${money(M.upcoming)} of bills still due` : 'No bills left this month', cls: M.left < 0 ? 'neg' : '' },
  ];
  const meters = [
    { key: 'need', label: '50% Needs', desc: 'Rent, groceries, transit, bills' },
    { key: 'want', label: '30% Wants', desc: 'Dining out, shopping, entertainment' },
    { key: 'save', label: '20% Savings', desc: 'Emergency fund and investments' },
  ];
  const diag = [
    { k: 'Daily average', v: money(M.burn), d: `across ${M.elapsed} day${M.elapsed === 1 ? '' : 's'}` },
    { k: 'Projected month-end spend', v: money(M.projected), d: `against ${money(M.spendable)} spendable` },
    { k: 'Projected surplus', v: money(M.projectedNet), d: M.projectedNet >= 0 ? 'On track' : 'Shortfall at this pace', neg: M.projectedNet < 0 },
    { k: 'Free before payday', v: money(M.cushion), d: `${M.daysToPayday} day${M.daysToPayday === 1 ? '' : 's'} to go`, neg: M.cushion < 0 },
  ];

  return (
    <>
      {error && <Alert>{error}</Alert>}
      {!data.hasAnyData && (
        <div className="banner">
          <span>Nothing logged yet. Add your first expense, or load a sample month to see how the dashboard works.</span>
          <span className="actions" style={{ marginLeft: 'auto' }}>
            <Link className="btn sm" to="/ledger">Add an expense</Link>
            <button className="btn sm ghost" type="button" onClick={loadSample} disabled={seeding}>{seeding ? 'Loading…' : 'Load sample month'}</button>
          </span>
        </div>
      )}
      <Alert>{seedError}</Alert>
      {user.income <= 0 && (
        <div className="banner">
          <span>Set your monthly income so the 50/30/20 targets and projections have something to measure against.</span>
          <Link className="btn sm" to="/budget">Set income</Link>
        </div>
      )}

      <div className="tiles">
        {tiles.map((t) => (
          <div className="tile" key={t.k}>
            <div className="k">{t.k}</div>
            <div className={`v ${t.cls || ''}`}>{t.v}</div>
            <div className="d">{t.d}</div>
          </div>
        ))}
      </div>

      <Card title="The 50 / 30 / 20 split" sub="Needs, wants and savings measured against your income for the month">
        <div className="meters">
          {meters.map((m) => {
            const spent = M.byKind[m.key];
            const target = M.target[m.key];
            const p = target > 0 ? (spent / target) * 100 : 0;
            const tone = m.key === 'save' ? (p >= 100 ? 'ok' : p >= 60 ? 'warn' : 'over') : (p > 100 ? 'over' : p > 85 ? 'warn' : 'ok');
            return (
              <div className="meter" key={m.key}>
                <div className="meter-h"><b>{m.label}</b><span className="pct">{pct(p)}</span></div>
                <div className="desc">{m.desc}</div>
                <Track pct={p} tone={tone} />
                <div className="figs"><span>{money(spent)}</span><span>target {money(target)}</span></div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Spend pace" sub={`Money out through ${monthLabel(month, false)} against an even daily pace`}>
        <div className="chartbox"><PaceChart metrics={M} cumulative={cumulative} money={money} /></div>
        <div className="legend">
          <span><i className="swatch" style={{ background: 'var(--accent)' }} /> Your cumulative spend</span>
          <span><i className="swatch" style={{ background: 'var(--ink-3)' }} /> Even pace to your spendable limit</span>
        </div>
        <hr className="rule" />
        <div className="chartbox"><DailyChart metrics={M} money={money} /></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginTop: 14 }}>
          {diag.map((d) => (
            <div key={d.k}>
              <div className="eyebrow">{d.k}</div>
              <div className={`num ${d.neg ? 'neg' : ''}`} style={{ fontSize: 19, fontWeight: 600, marginTop: 4 }}>{d.v}</div>
              <div className="tiny muted">{d.d}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Where the money went" sub="Spend against the cap you set for each category">
        <div className="rows">
          {categories.length === 0 && <p className="muted tiny">No entries for this month yet.</p>}
          {categories.map((r) => {
            const p = r.cap > 0 ? (r.spent / r.cap) * 100 : 0;
            const over = r.cap > 0 && r.spent > r.cap && r.kind !== 'save';
            const tone = over ? 'over' : p > 85 && r.kind !== 'save' ? 'warn' : r.kind === 'save' ? 'ok' : '';
            return (
              <div className="row" key={r.name}>
                <div className="name">{r.name} <span className={`pill ${over ? 'over' : r.kind}`}>{over ? `over by ${money(r.spent - r.cap)}` : KIND_LABEL[r.kind]}</span></div>
                <div className="amt">{money(r.spent)}{r.cap ? <span className="muted"> / {money(r.cap)}</span> : null}</div>
                <div className="bar"><Track pct={p} tone={tone} /></div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="What PocketSmart noticed" sub="Ranked by how much money is at stake">
        {insights.map((i, n) => (
          <div className="insight" key={n}>
            <div className={`dot ${i.level}`} />
            <div>
              <h4>{i.title}</h4>
              <p>{i.body}</p>
              <div className="do">{i.action}</div>
            </div>
          </div>
        ))}
      </Card>
      {loading && <span className="sr-only" role="status">Refreshing</span>}
    </>
  );
}
