import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApi, useApp } from '../lib/context.jsx';
import { Alert, Card, Input, Select } from '../components/ui.jsx';

export default function Budget() {
  const { user, setUser, meta, money } = useApp();
  const [basics, setBasics] = useState({ income: String(user.income), payday: String(user.payday), currency: user.currency });
  const [caps, setCaps] = useState(() => Object.fromEntries(meta.categories.map((c) => [c.name, String(user.caps[c.name] ?? c.cap)])));
  const [msg, setMsg] = useState({ basics: '', caps: '' });
  const [err, setErr] = useState({ basics: '', caps: '', bill: '' });
  const [fields, setFields] = useState({});
  const bills = useApi('/bills');
  const [bill, setBill] = useState({ name: '', amount: '', day: '' });

  const income = Number(basics.income) || 0;
  const capsTotal = Object.values(caps).reduce((s, v) => s + (Number(v) || 0), 0);
  const targets = { '50% Needs': income * 0.5, '30% Wants': income * 0.3, '20% Savings': income * 0.2, 'Spendable (needs + wants)': income * 0.8 };

  async function saveBasics(e) {
    e.preventDefault();
    setErr((x) => ({ ...x, basics: '' })); setMsg((x) => ({ ...x, basics: '' })); setFields({});
    try {
      const res = await api.put('/settings', { income: Number(basics.income), payday: Number(basics.payday), currency: basics.currency });
      setUser(res.user);
      setMsg((x) => ({ ...x, basics: 'Saved.' }));
    } catch (er) { setErr((x) => ({ ...x, basics: er.message })); setFields(er.details || {}); }
  }

  async function saveCaps() {
    setErr((x) => ({ ...x, caps: '' })); setMsg((x) => ({ ...x, caps: '' }));
    try {
      const body = Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, Number(v) || 0]));
      const res = await api.put('/settings', { caps: body });
      setUser(res.user);
      setMsg((x) => ({ ...x, caps: 'Caps saved.' }));
    } catch (er) { setErr((x) => ({ ...x, caps: er.message })); }
  }

  // Scale each group of categories so its caps add up to the matching 50/30/20 share of income.
  function rebalance() {
    const next = {};
    for (const kind of ['need', 'want', 'save']) {
      const group = meta.categories.filter((c) => c.kind === kind);
      const pool = income * { need: 0.5, want: 0.3, save: 0.2 }[kind];
      const base = group.reduce((s, c) => s + c.cap, 0) || 1;
      for (const c of group) next[c.name] = String(Math.round((pool * (c.cap / base)) / 100) * 100);
    }
    setCaps(next);
    setMsg((x) => ({ ...x, caps: 'Caps rebalanced. Save them to keep the change.' }));
  }

  async function addBill(e) {
    e.preventDefault();
    setErr((x) => ({ ...x, bill: '' }));
    try {
      await api.post('/bills', { name: bill.name, amount: Number(bill.amount), day: Number(bill.day) });
      setBill({ name: '', amount: '', day: '' });
      bills.reload();
    } catch (er) { setErr((x) => ({ ...x, bill: er.message })); }
  }
  async function removeBill(id) {
    try { await api.del(`/bills/${id}`); bills.reload(); } catch (er) { setErr((x) => ({ ...x, bill: er.message })); }
  }

  const billList = bills.data?.bills || [];

  return (
    <>
      <Card title="Income and pay cycle" sub="Everything else is calculated from these">
        <form onSubmit={saveBasics} noValidate>
          <Alert>{err.basics}</Alert>
          <Alert kind="good">{msg.basics}</Alert>
          <div className="formgrid" style={{ marginTop: err.basics || msg.basics ? 12 : 0 }}>
            <Input label="Monthly income" type="number" min="0" step="100" value={basics.income} onChange={(e) => setBasics({ ...basics, income: e.target.value })} error={fields.income} />
            <Input label="Payday (day of month)" type="number" min="1" max="31" step="1" value={basics.payday} onChange={(e) => setBasics({ ...basics, payday: e.target.value })} error={fields.payday} />
            <Select label="Currency" value={basics.currency} onChange={(e) => setBasics({ ...basics, currency: e.target.value })}>
              {Object.entries(meta.currencies).map(([k, c]) => <option key={k} value={k}>{c.symbol} {c.label}</option>)}
            </Select>
            <button className="btn" type="submit">Save</button>
          </div>
        </form>
        <hr className="rule" />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {Object.entries(targets).map(([k, v]) => (
            <div key={k}><div className="eyebrow">{k}</div><div className="num" style={{ fontSize: 19, fontWeight: 600, marginTop: 4 }}>{money(v)}</div></div>
          ))}
        </div>
      </Card>

      <Card title="Category caps" sub="Your ceiling for each category, per month">
        <Alert>{err.caps}</Alert>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', marginTop: err.caps ? 12 : 0 }}>
          {meta.categories.map((c) => (
            <Input key={c.name} label={c.name} type="number" min="0" step="100" value={caps[c.name]} onChange={(e) => setCaps({ ...caps, [c.name]: e.target.value })} />
          ))}
        </div>
        <hr className="rule" />
        <div className="actions">
          <span className="tiny muted">Caps total <b className="num">{money(capsTotal)}</b> against income of <b className="num">{money(income)}</b>.</span>
          <span className="actions" style={{ marginLeft: 'auto' }}>
            <button className="btn ghost sm" type="button" onClick={rebalance} disabled={income <= 0}>Rebalance to 50/30/20</button>
            <button className="btn sm" type="button" onClick={saveCaps}>Save caps</button>
          </span>
        </div>
        {msg.caps && <p className="tiny pos" role="status" style={{ margin: '10px 0 0' }}>{msg.caps}</p>}
      </Card>

      <Card title="Fixed bills" sub="Used to work out what is really free to spend before payday">
        <Alert>{err.bill}</Alert>
        <div className="tablewrap">
          <table style={{ minWidth: 420 }}>
            <thead><tr><th>Bill</th><th className="n">Day</th><th className="n">Amount</th><th /></tr></thead>
            <tbody>
              {billList.length === 0 && <tr><td colSpan={4} className="muted">{bills.data ? 'No fixed bills recorded.' : 'Loading…'}</td></tr>}
              {billList.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td><td className="n">{b.day}</td><td className="n">{money(b.amount)}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn link bad" type="button" onClick={() => removeBill(b.id)} aria-label={`Remove ${b.name}`}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <hr className="rule" />
        <form onSubmit={addBill} noValidate>
          <div className="formgrid">
            <Input label="Bill" type="text" maxLength={60} placeholder="Broadband" value={bill.name} onChange={(e) => setBill({ ...bill, name: e.target.value })} required />
            <Input label="Amount" type="number" min="0" step="1" value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} required />
            <Input label="Charged on day" type="number" min="1" max="31" step="1" value={bill.day} onChange={(e) => setBill({ ...bill, day: e.target.value })} required />
            <button className="btn" type="submit">Add bill</button>
          </div>
        </form>
      </Card>
    </>
  );
}
