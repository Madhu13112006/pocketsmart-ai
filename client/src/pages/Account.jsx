import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadCsv } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { Alert, Card, Input } from '../components/ui.jsx';

export default function Account() {
  const { user, setUser, logout } = useApp();
  const navigate = useNavigate();

  const [name, setName] = useState(user.name);
  const [nameMsg, setNameMsg] = useState({ kind: 'good', text: '' });

  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState({ kind: 'good', text: '' });
  const [pwFields, setPwFields] = useState({});

  const [confirm, setConfirm] = useState(null); // 'clear' | 'delete'
  const [delPw, setDelPw] = useState('');
  const [danger, setDanger] = useState({ kind: 'good', text: '' });
  const [delFields, setDelFields] = useState({});

  async function saveName(e) {
    e.preventDefault();
    try { setUser((await api.put('/settings', { name })).user); setNameMsg({ kind: 'good', text: 'Saved.' }); } catch (er) { setNameMsg({ kind: 'bad', text: er.message }); }
  }

  async function changePw(e) {
    e.preventDefault();
    setPwFields({});
    try {
      await api.post('/auth/password', pw);
      setPw({ current: '', next: '' });
      setPwMsg({ kind: 'good', text: 'Password changed.' });
    } catch (er) { setPwMsg({ kind: 'bad', text: er.message }); setPwFields(er.details || {}); }
  }

  async function clearData() {
    try { await api.del('/data'); setConfirm(null); setDanger({ kind: 'good', text: 'All expenses, bills and goals were removed.' }); } catch (er) { setDanger({ kind: 'bad', text: er.message }); }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    setDelFields({});
    try {
      await api.post('/auth/delete-account', { password: delPw });
      await logout();
      navigate('/register', { replace: true });
    } catch (er) { setDanger({ kind: 'bad', text: er.message }); setDelFields(er.details || {}); }
  }

  return (
    <>
      <h1 className="page-title">Your account</h1>
      <Card title="Profile" sub={user.email}>
        <form onSubmit={saveName} className="formgrid" noValidate>
          <Input label="Name" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn" type="submit" disabled={!name.trim() || name === user.name}>Save name</button>
        </form>
        {nameMsg.text && <div style={{ marginTop: 12 }}><Alert kind={nameMsg.kind}>{nameMsg.text}</Alert></div>}
      </Card>

      <Card title="Change password">
        <form onSubmit={changePw} noValidate className="grid">
          <div className="formgrid">
            <Input label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} error={pwFields.current} required />
            <Input label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} error={pwFields.next} required />
            <button className="btn" type="submit" disabled={!pw.current || !pw.next}>Change password</button>
          </div>
          {pwMsg.text && <Alert kind={pwMsg.kind}>{pwMsg.text}</Alert>}
        </form>
      </Card>

      <Card title="Your data" sub="You own it, so you can take it with you or remove it">
        <div className="actions">
          <button className="btn ghost" type="button" onClick={() => downloadCsv().catch((e) => setDanger({ kind: 'bad', text: e.message }))}>Export expenses as CSV</button>
          <button className="btn ghost" type="button" onClick={() => setConfirm(confirm === 'clear' ? null : 'clear')}>Remove all expenses, bills and goals</button>
        </div>
        {confirm === 'clear' && (
          <div className="alert bad" style={{ marginTop: 14 }}>
            <p style={{ margin: '0 0 10px' }}>This removes every expense, bill and goal. Your account and budget settings stay. It cannot be undone.</p>
            <div className="actions">
              <button className="btn danger sm" type="button" onClick={clearData}>Yes, remove them</button>
              <button className="btn ghost sm" type="button" onClick={() => setConfirm(null)}>Keep them</button>
            </div>
          </div>
        )}
        {danger.text && <div style={{ marginTop: 14 }}><Alert kind={danger.kind}>{danger.text}</Alert></div>}
      </Card>

      <Card title="Delete account">
        <p className="muted tiny" style={{ marginTop: 0 }}>Deleting your account removes your profile and everything you logged, permanently.</p>
        {confirm !== 'delete'
          ? <button className="btn ghost" type="button" onClick={() => setConfirm('delete')}>Delete my account</button>
          : (
            <form onSubmit={deleteAccount} className="formgrid" noValidate>
              <Input label="Confirm with your password" type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} error={delFields.password} required />
              <div className="actions">
                <button className="btn danger" type="submit" disabled={!delPw}>Delete permanently</button>
                <button className="btn ghost" type="button" onClick={() => { setConfirm(null); setDelPw(''); }}>Cancel</button>
              </div>
            </form>
          )}
      </Card>

      <div><button className="btn ghost" type="button" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>Sign out</button></div>
    </>
  );
}
