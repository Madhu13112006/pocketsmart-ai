import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/context.jsx';
import { Alert, Input } from '../components/ui.jsx';

export default function Auth({ mode }) {
  const { login, register } = useApp();
  const isRegister = mode === 'register';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setFields({});
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
    } catch (err) {
      setError(err.message);
      setFields(err.details || {});
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/login" className="brand">Pocket<em>Smart</em> AI</Link>
        <div style={{ display: 'grid', gap: 22 }}>
          <h1>Know where your money is heading before the month ends.</h1>
          <ul>
            <li><b>The 50/30/20 split, tracked live</b>Needs, wants and savings measured against your actual income.</li>
            <li><b>Can I afford it?</b>A score for any purchase, with a cheaper route when the answer is no.</li>
            <li><b>Goals with a monthly number</b>Each goal shows what it needs from you to land on time.</li>
          </ul>
        </div>
        <span className="tiny" style={{ opacity: 0.8 }}>Your entries are private to your account.</span>
      </aside>

      <main className="auth-main">
        <form className="auth-card" onSubmit={submit} noValidate>
          <div>
            <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              {isRegister ? 'It takes a minute. You can load a sample month to look around.' : 'Sign in to see your month.'}
            </p>
          </div>
          <Alert>{error}</Alert>
          {isRegister && <Input label="Your name" autoComplete="name" value={form.name} onChange={set('name')} error={fields.name} required />}
          <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fields.email} required />
          <Input
            label="Password" type="password" value={form.password} onChange={set('password')} error={fields.password}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            hint={isRegister ? 'At least 8 characters.' : undefined} required
          />
          <button className="btn" type="submit" disabled={busy}>{busy ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}</button>
          <p className="tiny muted" style={{ margin: 0 }}>
            {isRegister ? 'Already have an account? ' : 'New to PocketSmart? '}
            <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
