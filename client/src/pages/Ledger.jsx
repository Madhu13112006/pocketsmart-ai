import { useEffect, useState } from 'react';
import { api, downloadCsv, qs } from '../lib/api.js';
import { useApi, useApp, useMonth } from '../lib/context.jsx';
import { Alert, Card, Input, KIND_LABEL, Select } from '../components/ui.jsx';
import { dateInMonth, dayLabel } from '../lib/dates.js';

export default function Ledger() {
  const { meta, money } = useApp();
  const { month, today } = useMonth();
  const [cat, setCat] = useState('');
  const [kind, setKind] = useState('');
  const { data, error, reload } = useApi(`/transactions${qs({ month, cat, kind })}`);

  const defaultDate = () => dateInMonth(month, Number(today.slice(8, 10)));
  const blank = () => ({ date: defaultDate(), cat: meta.categories[0].name, amount: '', note: '' });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const kindOf = Object.fromEntries(meta.categories.map((c) => [c.name, c.kind]));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Keep the date field inside the month being viewed unless an entry is being edited.
  useEffect(() => { if (!editing) setForm((f) => ({ ...f, date: dateInMonth(month, Number(today.slice(8, 10))) })); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setFormError(''); setFields({});
    const body = { date: form.date, cat: form.cat, amount: Number(form.amount), note: form.note };
    try {
      if (editing) await api.put(`/transactions/${editing}`, body);
      else await api.post('/transactions', body);
      setEditing(null);
      setForm({ ...blank(), date: form.date, cat: form.cat });
      reload();
    } catch (err) {
      setFormError(err.message); setFields(err.details || {});
    } finally { setBusy(false); }
  }

  function startEdit(t) {
    setEditing(t.id);
    setForm({ date: t.date, cat: t.cat, amount: String(t.amount), note: t.note });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelEdit() { setEditing(null); setForm(blank()); setFormError(''); setFields({}); }

  async function remove(id) {
    try { await api.del(`/transactions/${id}`); if (editing === id) cancelEdit(); reload(); } catch (err) { setFormError(err.message); }
  }

  const list = data?.transactions || [];
  const total = list.reduce((s, t) => s + t.amount, 0);

  return (
    <>
      <Card title={editing ? 'Edit expense' : 'Log an expense'} sub="Needs, wants and savings are classified from the category">
        <form onSubmit={submit} noValidate>
          <Alert>{formError}</Alert>
          <div className="formgrid" style={{ marginTop: formError ? 12 : 0 }}>
            <Input label="Date" type="date" value={form.date} onChange={set('date')} error={fields.date} required />
            <Select label="Category" value={form.cat} onChange={set('cat')}>
              {meta.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </Select>
            <Input label="Amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" value={form.amount} onChange={set('amount')} error={fields.amount} required />
            <Input label="Note" type="text" maxLength={80} placeholder="What was it for?" value={form.note} onChange={set('note')} error={fields.note} />
            <div className="actions">
              <button className="btn" type="submit" disabled={busy}>{editing ? 'Save changes' : 'Add entry'}</button>
              {editing && <button className="btn ghost" type="button" onClick={cancelEdit}>Cancel</button>}
            </div>
          </div>
        </form>
      </Card>

      <Card
        title="Entries"
        sub={`${list.length} entr${list.length === 1 ? 'y' : 'ies'}, ${money(total)}`}
        right={<button className="btn ghost sm" type="button" onClick={() => downloadCsv().catch((e) => setFormError(e.message))}>Export all as CSV</button>}
      >
        <div className="formgrid" style={{ marginBottom: 14 }}>
          <Select label="Filter by category" value={cat} onChange={(e) => { setCat(e.target.value); if (e.target.value) setKind(''); }}>
            <option value="">All categories</option>
            {meta.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </Select>
          <Select label="Filter by type" value={kind} disabled={!!cat} onChange={(e) => setKind(e.target.value)}>
            <option value="">All types</option>
            <option value="need">Needs</option>
            <option value="want">Wants</option>
            <option value="save">Savings</option>
          </Select>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Note</th><th>Type</th><th className="n">Amount</th><th /></tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} className="muted">{data ? 'Nothing logged for this month yet.' : 'Loading…'}</td></tr>}
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="num">{dayLabel(t.date)}</td>
                  <td>{t.cat}</td>
                  <td className="muted">{t.note || '—'}</td>
                  <td><span className={`pill ${kindOf[t.cat]}`}>{KIND_LABEL[kindOf[t.cat]]}</span></td>
                  <td className="n">{money(t.amount, true)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn link" type="button" onClick={() => startEdit(t)}>Edit</button>{' '}
                    <button className="btn link bad" type="button" onClick={() => remove(t.id)} aria-label={`Remove ${t.cat} entry of ${money(t.amount)}`}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
