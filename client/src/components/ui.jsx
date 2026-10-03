import { useId } from 'react';

export function Field({ label, error, hint, children, className }) {
  return (
    <div className={`field ${className || ''}`}>
      <label>{label}</label>
      {children}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** A labelled input where the label is wired to the control for screen readers and clicks. */
export function Input({ label, error, hint, className, ...props }) {
  const id = useId();
  return (
    <div className={`field ${className || ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-e` : undefined} {...props} />
      {error ? <span className="err" id={`${id}-e`} role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Select({ label, children, className, ...props }) {
  const id = useId();
  return (
    <div className={`field ${className || ''}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>{children}</select>
    </div>
  );
}

export function Card({ title, sub, children, className = '', right }) {
  return (
    <section className={`card ${className}`}>
      {(title || sub || right) && (
        <div className="card-h">
          {title && <h2>{title}</h2>}
          {sub && <span className="sub">{sub}</span>}
          {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export const Alert = ({ kind = 'bad', children }) => (children ? <div className={`alert ${kind}`} role={kind === 'bad' ? 'alert' : 'status'}>{children}</div> : null);

export function Track({ pct, tone = '' }) {
  return <div className="track"><i className={tone} style={{ width: `${Math.max(0, Math.min(100, pct)).toFixed(1)}%` }} /></div>;
}

export const KIND_LABEL = { need: 'Need', want: 'Want', save: 'Save' };
export const pct = (n) => `${Math.round(n * 10) / 10}%`;

export function Loading({ label = 'Loading' }) {
  return <p className="muted" role="status">{label}…</p>;
}
