import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { Alert, Card, Input, Select, Track, pct } from '../components/ui.jsx';

export default function Planner() {
  const { meta, money } = useApp();
  const [form, setForm] = useState({ kind: 'home', budget: '50000', style: 'balanced' });
  const [out, setOut] = useState(null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setFields({});
    try { setOut(await api.post('/plan', { kind: form.kind, budget: Number(form.budget), style: form.style })); } catch (er) { setError(er.message); setFields(er.details || {}); } finally { setBusy(false); }
  }

  return (
    <>
      <Card title="Budget planner" sub="Give it an occasion and a total, and it splits the money into line items">
        <form onSubmit={submit} noValidate>
          <Alert>{error}</Alert>
          <div className="formgrid" style={{ marginTop: error ? 12 : 0 }}>
            <Select label="Occasion" value={form.kind} onChange={set('kind')}>
              {meta.plans.map((p) => <option key={p.kind} value={p.kind}>{p.title}</option>)}
            </Select>
            <Input label="Total budget" type="number" min="500" step="500" value={form.budget} onChange={set('budget')} error={fields.budget} required />
            <Select label="Priority" value={form.style} onChange={set('style')}>
              <option value="balanced">Balanced</option>
              <option value="value">Stretch it further</option>
              <option value="premium">Fewer, better things</option>
            </Select>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Building…' : 'Build the plan'}</button>
          </div>
        </form>
      </Card>

      {out && (
        <Card title={`${out.plan.title}: ${money(out.plan.total)}`} sub={`${out.plan.lines.length} line items, allocated by share of the total`}>
          <div className="rows">
            {out.plan.lines.map((l) => (
              <div className="row" key={l.name}>
                <div className="name">
                  {l.name}
                  {l.links.length > 0
                    ? <div className="linkrow">{l.links.map((k) => <a key={k.label} href={k.url} target="_blank" rel="noopener noreferrer">{k.label}</a>)}</div>
                    : <div className="tiny muted" style={{ marginTop: 3 }}>Held back, not allocated to a purchase</div>}
                </div>
                <div className="amt">{money(l.amount)}<div className="tiny muted">{pct(l.share * 100)}</div></div>
                <div className="bar"><Track pct={l.share * 100} /></div>
              </div>
            ))}
          </div>
          <hr className="rule" />
          <p className="tiny muted" style={{ margin: 0 }}>
            {out.context.shareOfIncome !== null
              ? <>That is {pct(out.context.shareOfIncome)} of one month's income. Saved from your 20% slice, it takes about {out.context.monthsOfSavings} month{out.context.monthsOfSavings === 1 ? '' : 's'} with no borrowing. </>
              : <>Set your income on the Budget page to see how long this takes to save for. </>}
            Retailer links open a search. Nothing is bought or reserved here.
          </p>
        </Card>
      )}
    </>
  );
}
