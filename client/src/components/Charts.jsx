// Hand-drawn SVG charts. Every mark, tick and label is placed with one scale per axis.
const niceMax = (v) => {
  if (!(v > 0)) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  return (steps.find((s) => n <= s) || 10) * p;
};

export function PaceChart({ metrics, cumulative, money }) {
  const W = 720, H = 210, L = 70, R = 12, T = 12, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const { dim, elapsed, spendable } = metrics;
  const shown = elapsed > 0 ? elapsed : dim;
  const run = cumulative[dim] ?? 0;
  const maxV = niceMax(Math.max(spendable, run, 1) * 1.05);
  const x = (d) => L + pw * (d / dim);
  const y = (v) => T + ph - ph * (v / maxV);

  let line = '';
  let area = `M ${x(0)} ${y(0)}`;
  for (let i = 0; i <= shown; i++) {
    line += `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(cumulative[i]).toFixed(1)} `;
    area += ` L ${x(i).toFixed(1)} ${y(cumulative[i]).toFixed(1)}`;
  }
  area += ` L ${x(shown).toFixed(1)} ${y(0)} Z`;
  const over = cumulative[shown] > spendable * (shown / dim);
  const label = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--ink-3)' };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Cumulative spend of ${money(run)} against an even pace to ${money(spendable)}`}>
      {[0, maxV / 2, maxV].map((t) => (
        <g key={t}>
          <line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke="var(--line-soft)" strokeWidth="1" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" style={label}>{money(t)}</text>
        </g>
      ))}
      {[1, Math.round(dim / 2), dim].map((d) => (
        <text key={d} x={x(d)} y={H - 10} textAnchor="middle" style={label}>{d}</text>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(dim)} y2={y(spendable)} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="5 4" />
      <path d={area} fill="var(--accent)" opacity="0.13" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(shown)} cy={y(cumulative[shown])} r="4.5" fill={over ? 'var(--bad)' : 'var(--accent)'} stroke="var(--surface)" strokeWidth="2" />
      <line x1={L} y1={T + ph} x2={W - R} y2={T + ph} stroke="var(--line)" strokeWidth="1" />
    </svg>
  );
}

export function DailyChart({ metrics, money }) {
  const W = 720, H = 120, L = 70, R = 12, T = 10, B = 24;
  const pw = W - L - R, ph = H - T - B;
  const { dim, byDay, burn } = metrics;
  const maxD = Math.max(0, ...byDay.slice(1));
  const maxV = niceMax(maxD || 1);
  const step = pw / dim;
  const bw = Math.max(2, step * 0.6);
  const avgY = T + ph - (Math.min(burn, maxV) / maxV) * ph;
  const label = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--ink-3)' };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Daily spend, highest day ${money(maxD)}`}>
      <text x={L - 8} y={T + 8} textAnchor="end" style={label}>{money(maxV)}</text>
      <text x={L - 8} y={T + ph + 4} textAnchor="end" style={label}>{money(0)}</text>
      {byDay.slice(1).map((v, i) => {
        if (v <= 0) return null;
        const h = Math.max(1.5, (v / maxV) * ph);
        return (
          <rect key={i} x={L + step * (i + 0.5) - bw / 2} y={T + ph - h} width={bw} height={h} rx="1.5"
            fill={v > burn * 2 ? 'var(--warn)' : 'var(--accent)'} opacity="0.85">
            <title>{`Day ${i + 1}: ${money(v)}`}</title>
          </rect>
        );
      })}
      {burn > 0 && (
        <>
          <line x1={L} y1={avgY} x2={W - R} y2={avgY} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="4 4" />
          <text x={W - R} y={avgY - 5} textAnchor="end" style={{ ...label, fontSize: 10.5 }}>daily average {money(burn)}</text>
        </>
      )}
      <line x1={L} y1={T + ph} x2={W - R} y2={T + ph} stroke="var(--line)" strokeWidth="1" />
      <text x={L} y={H - 8} style={label}>1</text>
      <text x={W - R} y={H - 8} textAnchor="end" style={label}>{dim}</text>
    </svg>
  );
}
