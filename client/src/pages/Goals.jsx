import { useState } from 'react';
import { api, qs } from '../lib/api.js';
import { useApi, useApp, useMonth } from '../lib/context.jsx';
import { Alert, Card, Input, Loading, Track, pct } from '../components/ui.jsx';
import { addYears } from '../lib/dates.js';

export default function Goals() {
  const { money, user } = useApp();
  const { today } = useMonth();
  const { data, error, reload } = useApi(`/goals${qs({ today })}`);
  const [form, setForm] = useState({ name: '', target: '', saved: '0', by: addYears(today, 1) });
  const [formError, setFormError] = useState('');
  const [fields, setFields] = useState({});
  const [amounts, setAmounts] = useState({});
  const [rowError, setRowError] = useState('');
  const savingsSlice = (user.income || 0) * 0.2;

  async function add(e) {
    e.preventDefault();
    setFormError(''); setFields({});
    try {
      await api.post('/goals', { name: form.name, target: Number(form.target), saved: Number(form.saved) || 0, by: form.by });
      setForm({ name: '', target: '', saved: '0', by: addYears(today, 1) });
      reload();
    } catch (er) { setFormError(er.message); setFields(er.details || {}); }
  }

  async function contribute(id) {
    setRowError('');
    try {
      await api.post(`/goals/${id}/contribute`, { amount: Number(amounts[id]), date: today });
      setAmounts((a) => ({ ...a, [id]: '' }));
      reload();
    } catch (er) { setRowError(er.message); }
  }

  async function remove(id) {
    setRowError('');
    try { await api.del(`/goals/${id}`); reload(); } catch (er) { setRowError(er.message); }
  }

  const goals = data?.goals;
  return (
    <>
      <Card title="Savings goals" sub="Each goal shows what it needs from you every month to land on time">
        <Alert>{error || rowError}</Alert>
        {!goals && !error && <Loading />}
        {goals && goals.length === 0 && <p className="muted tiny" style={{ margin: 0 }}>No goals yet. Add one below and PocketSmart will work out the monthly contribution.</p>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: error || rowError ? 12 : 0 }}>
          {goals?.map((g) => {
            const p = g.target > 0 ? (g.saved / g.target) * 100 : 0;
            const strain = savingsSlice > 0 ? g.monthly / savingsSlice : 0;
            const tone = p >= 100 ? 'ok' : strain > 1 ? 'over' : strain > 0.6 ? 'warn' : 'ok';
            return (
              <div className="goal" key={g.id}>
                <div className="goal-h"><b>{g.name}</b><span className="num tiny muted">{pct(p)}</span></div>
                <Track pct={p} tone={tone} />
                <div className="figs" style={{ marginTop: 0 }}><span>{money(g.saved)}</span><span>of {money(g.target)}</span></div>
                <div className="tiny muted">
                  {p >= 100
                    ? 'Goal reached.'
                    : <>Needs <b className="num">{money(g.monthly)}</b> a month for {g.monthsLeft} month{g.monthsLeft === 1 ? '' : 's'} to land by {g.by}.</>}
                </div>
                <div className="actions">
                  <input type="number" min="1" step="100" placeholder="Add amount" aria-label={`Amount to add to ${g.name}`} style={{ maxWidth: 130 }}
                    value={amounts[g.id] || ''} onChange={(e) => setAmounts({ ...amounts, [g.id]: e.target.value })} />
                  <button className="btn sm" type="button" onClick={() => contribute(g.id)} disabled={!(Number(amounts[g.id]) > 0)}>Add</button>
                  <button className="btn link bad" type="button" onClick={() => remove(g.id)} style={{ marginLeft: 'auto' }} aria-label={`Remove ${g.name}`}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Add a goal">
        <form onSubmit={add} noValidate>
          <Alert>{formError}</Alert>
          <div className="formgrid" style={{ marginTop: formError ? 12 : 0 }}>
            <Input label="Goal" type="text" maxLength={60} placeholder="New laptop" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} required />
            <Input label="Target amount" type="number" min="1" step="100" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} error={fields.target} required />
            <Input label="Already saved" type="number" min="0" step="100" value={form.saved} onChange={(e) => setForm({ ...form, saved: e.target.value })} error={fields.saved} />
            <Input label="Needed by" type="date" value={form.by} onChange={(e) => setForm({ ...form, by: e.target.value })} error={fields.by} required />
            <button className="btn" type="submit">Add goal</button>
          </div>
        </form>
        <p className="tiny muted" style={{ margin: '12px 0 0' }}>Adding money to a goal also logs it as savings for today, so it counts toward this month's 20%.</p>
      </Card>
    </>
  );
}
