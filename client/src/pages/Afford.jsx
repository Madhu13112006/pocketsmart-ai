import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp, useMonth } from '../lib/context.jsx';
import { Alert, Card, Input, Select } from '../components/ui.jsx';

export default function Afford() {
  const { meta } = useApp();
  const { today } = useMonth();
  const [form, setForm] = useState({ item: '', amount: '', cat: 'Shopping', when: 'month' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setFields({});
    try {
      const res = await api.post('/afford', { item: form.item, amount: Number(form.amount), cat: form.cat, when: form.when, today });
      setResult(res.result);
    } catch (er) { setError(er.message); setFields(er.details || {}); } finally { setBusy(false); }
  }

  return (
    <div className="grid cols-2">
      <Card title="Can I afford this?" sub="Checked against cash left, your cap, upcoming bills and days to payday">
        <form onSubmit={submit} noValidate className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <Alert>{error}</Alert>
          <Input label="What is it" type="text" maxLength={60} placeholder="Noise-cancelling headphones" value={form.item} onChange={set('item')} error={fields.item} required />
          <Input label="Price" type="number" min="1" step="1" placeholder="0" value={form.amount} onChange={set('amount')} error={fields.amount} required />
          <Select label="Category" value={form.cat} onChange={set('cat')}>
            {meta.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </Select>
          <Select label="How soon do you need it" value={form.when} onChange={set('when')}>
            <option value="now">Right now, it can't wait</option>
            <option value="month">Sometime this month</option>
            <option value="later">It can wait</option>
          </Select>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Check it'}</button>
        </form>
      </Card>
      <Result result={result} />
    </div>
  );
}

function Result({ result }) {
  const { money } = useApp();
  if (!result) {
    return (
      <Card title="Ready when you are" className="flat">
        <p className="muted tiny" style={{ margin: 0 }}>
          PocketSmart scores a purchase out of 100 on five signals: cash free before payday, headroom in that category, your daily float, whether your goals still get funded, and whether it is a need or a want. If the score is low it suggests a cheaper way to get it.
        </p>
      </Card>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
      <div className={`verdict ${result.band.key}`} aria-live="polite">
        <div className="score">
          <div className="big">{result.score}</div>
          <div>
            <div className="lbl">{result.band.label}</div>
            <div className="tiny">{result.item}, {money(result.amount)} in {result.cat}</div>
          </div>
        </div>
        <div className="signals">
          {result.signals.map((s) => (
            <div className="signal" key={s.name}>
              <span>{s.name}</span>
              <span className="st"><i style={{ width: `${(s.value * 100).toFixed(0)}%` }} /></span>
              <span className="num">{s.text}</span>
            </div>
          ))}
        </div>
      </div>
      <Card title="Why">
        <ul className="plain">{result.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
        <hr className="rule" />
        <div className="eyebrow" style={{ marginBottom: 8 }}>What to do instead</div>
        <ul className="plain">{result.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul>
      </Card>
    </div>
  );
}
