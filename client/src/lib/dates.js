const pad = (n) => String(n).padStart(2, '0');

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Today in the viewer's own time zone as YYYY-MM-DD. The API never guesses the client's date. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const monthOf = (iso) => iso.slice(0, 7);

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month, short = true) {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[m - 1];
  return `${short ? name.slice(0, 3) : name} ${y}`;
}

export function dayLabel(iso) {
  return `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
}

export function addYears(iso, years) {
  const [y, m, d] = iso.split('-').map(Number);
  const dim = new Date(y + years, m, 0).getDate();
  return `${y + years}-${pad(m)}-${pad(Math.min(d, dim))}`;
}

/** Keep the same day-of-month when it fits inside `month`, otherwise clamp to its last day. */
export function dateInMonth(month, day) {
  const [y, m] = month.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  return `${month}-${pad(Math.min(day, dim))}`;
}
