// PocketSmart's recommendation engine. Pure functions: nothing here touches the database or the
// clock, so every number can be reproduced from the inputs. `today` is always passed in as YYYY-MM-DD.
import { CATEGORIES, KIND_OF, CURRENCIES } from './categories.js';

const KIND_LABEL = { need: 'Need', want: 'Want', save: 'Save' };

/* ------------------------------ helpers ------------------------------ */

export function makeMoney(currency = 'inr') {
  const c = CURRENCIES[currency] || CURRENCIES.inr;
  return (n, decimals = false) => {
    const v = Number(n) || 0;
    const rounded = decimals ? Math.round(v * 100) / 100 : Math.round(v);
    let body;
    try {
      body = rounded.toLocaleString(c.locale, { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 });
    } catch {
      body = String(rounded);
    }
    return c.symbol + body;
  };
}

const pct = (n) => `${Math.round(n * 10) / 10}%`;
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const pad = (n) => String(n).padStart(2, '0');

export const monthOf = (dateStr) => dateStr.slice(0, 7);
export const dayOf = (dateStr) => parseInt(dateStr.slice(8, 10), 10);

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/**
 * Calendar months between `today` and the deadline, never less than 1. Sep 30 to Jan 31 is 4:
 * contributions in Oct, Nov, Dec and Jan. Counting fewer months is the cautious choice, because
 * it asks for slightly more per month rather than letting the goal slip late.
 */
export function monthsUntil(by, today) {
  const [ty, tm] = today.split('-').map(Number);
  const [by_, bm] = by.split('-').map(Number);
  return Math.max(1, (by_ - ty) * 12 + (bm - tm));
}

export function goalMonthly(goal, today) {
  const remaining = Math.max(0, goal.target - goal.saved);
  return remaining / monthsUntil(goal.by, today);
}

/* ------------------------------ dashboard ------------------------------ */

/**
 * @param {object} p
 * @param {{income:number,payday:number,caps:Record<string,number>,currency:string}} p.settings
 * @param {string} p.month   YYYY-MM being viewed
 * @param {string} p.today   YYYY-MM-DD
 * @param {Array}  p.txns    transactions that fall in `month`
 * @param {Array}  p.bills
 * @param {Array}  p.goals
 */
export function computeMetrics({ settings, month, today, txns, bills = [], goals = [] }) {
  const dim = daysInMonth(month);
  const todayMonth = monthOf(today);
  const isCurrent = todayMonth === month;
  const elapsed = isCurrent ? Math.min(dayOf(today), dim) : month < todayMonth ? dim : 0;

  const byCat = {};
  const byKind = { need: 0, want: 0, save: 0 };
  const byDay = new Array(dim + 1).fill(0);
  for (const t of txns) {
    const kind = KIND_OF[t.cat] || 'want';
    byCat[t.cat] = (byCat[t.cat] || 0) + t.amount;
    byKind[kind] += t.amount;
    const d = dayOf(t.date);
    if (d >= 1 && d <= dim) byDay[d] += t.amount;
  }

  const income = Number(settings.income) || 0;
  const outflow = byKind.need + byKind.want;
  const committed = outflow + byKind.save;
  const left = income - committed;
  const target = { need: income * 0.5, want: income * 0.3, save: income * 0.2 };
  const spendable = income - target.save;

  const burn = elapsed > 0 ? outflow / elapsed : 0;
  const projected = burn * dim;
  const projectedNet = income - projected - byKind.save;

  let daysToPayday = dim;
  if (isCurrent) {
    const day = dayOf(today);
    const payday = Math.min(settings.payday || 1, dim);
    if (payday > day) daysToPayday = payday - day;
    else daysToPayday = dim - day + Math.min(settings.payday || 1, daysInMonth(nextMonth(month)));
  }
  daysToPayday = Math.max(1, daysToPayday);

  let upcoming = 0;
  if (isCurrent) {
    for (const b of bills) if (b.day > dayOf(today) && b.day <= dim) upcoming += b.amount;
  }

  const goalNeed = goals.reduce((s, g) => s + goalMonthly(g, today), 0);
  const goalShort = Math.max(0, goalNeed - byKind.save);

  return {
    month, today, isCurrent, dim, elapsed,
    income, outflow, committed, left,
    target, spendable, burn, projected, projectedNet,
    daysToPayday, upcoming, cushion: left - upcoming,
    goalNeed, goalShort,
    savingsRate: income > 0 ? (byKind.save / income) * 100 : 0,
    byCat, byKind, byDay,
  };
}

export function categoryRows(metrics, caps) {
  return CATEGORIES.map((c) => ({
    name: c.name,
    kind: c.kind,
    spent: metrics.byCat[c.name] || 0,
    cap: Number(caps[c.name]) || 0,
  }))
    .filter((r) => r.spent > 0 || r.cap > 0)
    .sort((a, b) => b.spent - a.spent);
}

/* ------------------------------ insights ------------------------------ */

export function buildInsights({ metrics: M, settings, goals = [] }) {
  const money = makeMoney(settings.currency);
  const caps = settings.caps;
  const out = [];

  for (const c of CATEGORIES) {
    const spent = M.byCat[c.name] || 0;
    const cap = Number(caps[c.name]) || 0;
    if (c.kind === 'save') continue;
    if (cap > 0 && spent > cap) {
      out.push({
        weight: (spent - cap) * 1.4, level: 'bad',
        title: `${c.name} is over its cap by ${money(spent - cap)}`,
        body: `You set ${money(cap)} for the month and have spent ${money(spent)}, which is ${pct((spent / cap) * 100)} of the cap.`,
        action: M.isCurrent
          ? `Pause ${c.name} spending for the rest of the month, or raise the cap to ${money(Math.ceil(spent / 100) * 100)} and take it from a category you under-use.`
          : `Set next month's cap at ${money(Math.ceil(spent / 100) * 100)} or plan to spend less here.`,
      });
    } else if (M.isCurrent && cap > 0 && spent >= cap * 0.9 && M.elapsed < M.dim) {
      out.push({
        weight: cap - spent + 400, level: 'warn',
        title: `${c.name} has ${money(cap - spent)} left`,
        body: `${money(spent)} of the ${money(cap)} cap is gone with ${M.dim - M.elapsed} days still to go.`,
        action: `That leaves about ${money((cap - spent) / Math.max(1, M.dim - M.elapsed))} a day in this category.`,
      });
    }
  }

  if (M.isCurrent && M.elapsed > 2 && M.elapsed < M.dim && M.income > 0) {
    if (M.projected > M.spendable) {
      out.push({
        weight: (M.projected - M.spendable) * 1.6, level: 'bad',
        title: `At this pace you finish the month ${money(M.projected - M.spendable)} over`,
        body: `You are spending ${money(M.burn)} a day. Carried to day ${M.dim} that is ${money(M.projected)}, against ${money(M.spendable)} of spendable income.`,
        action: `Drop to ${money(Math.max(0, (M.spendable - M.outflow) / Math.max(1, M.dim - M.elapsed)))} a day for the remaining ${M.dim - M.elapsed} days to land on target.`,
      });
    } else {
      out.push({
        weight: 600, level: 'good',
        title: `Your pace lands ${money(M.spendable - M.projected)} under budget`,
        body: `At ${money(M.burn)} a day you project ${money(M.projected)} of spending against ${money(M.spendable)} spendable.`,
        action: 'Move the projected surplus into a goal before it gets spent.',
      });
    }
  }

  if (M.income > 0 && M.savingsRate < 20) {
    const gap = M.target.save - M.byKind.save;
    out.push({
      weight: gap * 1.2, level: M.savingsRate < 10 ? 'bad' : 'warn',
      title: `Savings rate is ${pct(M.savingsRate)}, against the 20% target`,
      body: `You have put aside ${money(M.byKind.save)} of the ${money(M.target.save)} the 50/30/20 split calls for.`,
      action: `A standing transfer of ${money(gap)} on payday closes it without needing a decision each month.`,
    });
  }

  if (M.income > 0 && M.byKind.want > M.target.want) {
    out.push({
      weight: (M.byKind.want - M.target.want) * 1.1, level: 'warn',
      title: `Wants are ${money(M.byKind.want - M.target.want)} past the 30% line`,
      body: `Discretionary spending is ${money(M.byKind.want)}, or ${pct((M.byKind.want / M.income) * 100)} of income.`,
      action: 'Cap the two largest want categories first, since they account for most of it.',
    });
  }

  let top = null;
  for (const k of Object.keys(M.byCat)) {
    if (KIND_OF[k] === 'save') continue;
    if (!top || M.byCat[k] > M.byCat[top]) top = k;
  }
  if (top && M.outflow > 0 && M.byCat[top] / M.outflow > 0.35 && KIND_OF[top] !== 'need') {
    out.push({
      weight: M.byCat[top], level: 'warn',
      title: `${top} alone is ${pct((M.byCat[top] / M.outflow) * 100)} of everything you spent`,
      body: `${money(M.byCat[top])} out of ${money(M.outflow)} went to one discretionary category.`,
      action: `Trimming it by a quarter frees ${money(M.byCat[top] * 0.25)} a month.`,
    });
  }

  if (M.isCurrent) {
    for (const g of goals) {
      const need = goalMonthly(g, M.today);
      const months = monthsUntil(g.by, M.today);
      if (need > 0 && need > M.target.save) {
        out.push({
          weight: need - M.target.save, level: 'warn',
          title: `"${g.name}" needs ${money(need)} a month to land on time`,
          body: `That is more than the whole ${money(M.target.save)} savings slice, with ${months} month${months === 1 ? '' : 's'} left.`,
          action: `Push the date out, or cut the target to ${money(g.saved + M.target.save * months)}.`,
        });
      }
    }
  }

  const subs = M.byCat.Subscriptions || 0;
  if (M.income > 0 && subs > M.income * 0.03) {
    out.push({
      weight: subs * 2, level: 'warn',
      title: `Subscriptions are running at ${money(subs)} a month`,
      body: `That is ${pct((subs / M.income) * 100)} of income, or ${money(subs * 12)} a year, charged whether you use them or not.`,
      action: 'Cancelling the least-used one is the cheapest saving available to you this month.',
    });
  }

  if (M.elapsed >= 7) {
    let noSpend = 0;
    for (let d = 1; d <= M.elapsed; d++) if (M.byDay[d] === 0) noSpend++;
    const good = noSpend >= Math.round(M.elapsed * 0.25);
    out.push({
      weight: 300, level: good ? 'good' : 'info',
      title: `${noSpend} no-spend day${noSpend === 1 ? '' : 's'} out of ${M.elapsed}`,
      body: good
        ? 'A quarter of your days cost nothing, which is what keeps the daily average down.'
        : `Most days carry some spending, so the daily average of ${money(M.burn)} has little slack in it.`,
      action: `Two more no-spend days a week would free up to ${money(M.burn * 8)} a month.`,
    });
  }

  if (!out.length) {
    out.push({
      weight: 1, level: 'good',
      title: M.committed > 0 ? 'Nothing is off track this month' : 'Nothing to report yet',
      body: M.committed > 0
        ? 'Every category is inside its cap and the split is holding.'
        : 'Log a few expenses and PocketSmart will start flagging where the month is heading.',
      action: 'Log entries as you go so the projection stays accurate.',
    });
  }

  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, 6).map(({ weight, ...rest }) => rest);
}

/* --------------------------- affordability --------------------------- */

export function evaluateAffordability({ metrics: M, settings, item, amount, cat, when }) {
  const money = makeMoney(settings.currency);
  const kind = KIND_OF[cat] || 'want';
  const cap = Number(settings.caps[cat]) || 0;
  const spentCat = M.byCat[cat] || 0;
  const headroom = Math.max(0, cap - spentCat);
  const after = M.cushion - amount;

  const s1 = M.cushion <= 0 ? 0 : clamp01(after / M.cushion);
  const s2 = headroom <= 0 ? 0 : clamp01((headroom - amount) / headroom);
  const floor = Math.max(M.burn * 0.45, 1);
  const perDay = after / M.daysToPayday;
  const s3 = clamp01(perDay / floor);
  const s4 = M.goalShort <= 0 ? 1 : clamp01(after / M.goalShort);
  const s5 = kind !== 'want' ? 1 : when === 'now' ? 0.55 : when === 'month' ? 0.4 : 0.25;

  const score = Math.max(0, Math.min(100, Math.round(s1 * 35 + s2 * 25 + s3 * 20 + s4 * 10 + s5 * 10)));
  const band = score >= 75 ? { key: 'go', label: 'Go ahead' }
    : score >= 55 ? { key: 'plan', label: 'Yes, with a plan' }
    : score >= 35 ? { key: 'wait', label: 'Wait for payday' }
    : { key: 'skip', label: 'Skip it this month' };

  const why = [];
  if (after < 0) why.push(`It costs ${money(-after)} more than the ${money(Math.max(0, M.cushion))} you have free before payday.`);
  else why.push(`It leaves ${money(after)} free, or ${money(perDay)} a day across the ${M.daysToPayday} day${M.daysToPayday === 1 ? '' : 's'} until payday.`);
  if (cap > 0) {
    why.push(amount > headroom
      ? `${cat} has ${money(headroom)} left of its ${money(cap)} cap, so this pushes it ${money(amount - headroom)} over.`
      : `${cat} has ${money(headroom)} left of its ${money(cap)} cap, which covers it.`);
  }
  if (M.upcoming > 0) why.push(`${money(M.upcoming)} of fixed bills is still due before payday and has already been set aside.`);
  if (M.goalShort > 0) why.push(`Your goals still need ${money(M.goalShort)} from this month.`);

  const alternatives = [];
  if (score < 75) {
    if (M.daysToPayday <= 10) alternatives.push(`Wait ${M.daysToPayday} day${M.daysToPayday === 1 ? '' : 's'} for payday, when the same purchase scores far higher against a full month of income.`);
    let donor = null;
    for (const c of CATEGORIES) {
      if (c.kind !== 'want' || c.name === cat) continue;
      const free = (Number(settings.caps[c.name]) || 0) - (M.byCat[c.name] || 0);
      if (free > 0 && (!donor || free > donor.free)) donor = { name: c.name, free };
    }
    const shortfall = Math.max(0, amount - headroom);
    if (donor && shortfall > 0) alternatives.push(`Move ${money(Math.min(donor.free, shortfall))} of unused ${donor.name} budget across, which is the cheapest place to take it from.`);
    if (amount > 2000 && amount <= M.spendable) alternatives.push(`Split it across two months at ${money(amount / 2)} each, which keeps both months inside the 30% wants line.`);
    if (kind === 'want' && M.target.save > 0) {
      const months = Math.max(2, Math.ceil(amount / M.target.save));
      alternatives.push(`Set it as a goal instead: ${money(amount / months)} a month buys it outright in ${months} months, inside your ${money(M.target.save)} savings slice.`);
    }
  } else {
    alternatives.push('Log it straight away so the rest of the month is measured against the real number.');
    if (M.goalShort > 0) alternatives.push(`Your goals still need ${money(M.goalShort)}, so move that across first, then buy.`);
  }

  return {
    item, amount, cat, score, band, why, alternatives,
    signals: [
      { name: 'Cash before payday', value: s1, text: `${money(Math.max(0, after))} left` },
      { name: 'Category headroom', value: s2, text: cap > 0 ? `${money(Math.max(0, headroom - amount))} left` : 'no cap set' },
      { name: 'Daily float', value: s3, text: `${money(Math.max(0, perDay))}/day` },
      { name: 'Goal safety', value: s4, text: M.goalShort > 0 ? `${money(M.goalShort)} short` : 'goals covered' },
      { name: 'Need vs want', value: s5, text: KIND_LABEL[kind] },
    ],
  };
}

/* ------------------------------- planner ------------------------------- */

const SHOPS = {
  amazon: { label: 'Amazon', url: 'https://www.amazon.in/s?k=' },
  flipkart: { label: 'Flipkart', url: 'https://www.flipkart.com/search?q=' },
  ikea: { label: 'IKEA', url: 'https://www.ikea.com/in/en/search/?q=' },
  pepper: { label: 'Pepperfry', url: 'https://www.pepperfry.com/site_product/search?q=' },
  swiggy: { label: 'Swiggy', url: 'https://www.swiggy.com/search?query=' },
  zomato: { label: 'Zomato', url: 'https://www.zomato.com/search?q=' },
  mmt: { label: 'MakeMyTrip', url: 'https://www.makemytrip.com/hotels/?searchText=' },
  irctc: { label: 'IRCTC', url: 'https://www.irctc.co.in/nget/train-search?q=' },
  tanishq: { label: 'Tanishq', url: 'https://www.tanishq.co.in/search?q=' },
  bluestone: { label: 'BlueStone', url: 'https://www.bluestone.com/search.html?q=' },
};

export const PLAN_TEMPLATES = {
  home: { title: 'Home interior setup', lines: [
    { name: 'Sofa or main seating', share: 0.24, q: '3 seater fabric sofa', shops: ['ikea', 'pepper', 'amazon'] },
    { name: 'Dining table and chairs', share: 0.17, q: '4 seater dining table set', shops: ['pepper', 'ikea', 'flipkart'] },
    { name: 'Storage and wardrobe', share: 0.15, q: 'wardrobe storage cabinet', shops: ['ikea', 'pepper', 'amazon'] },
    { name: 'Lighting', share: 0.11, q: 'ceiling light pendant lamp', shops: ['amazon', 'ikea', 'flipkart'] },
    { name: 'Fans and cooling', share: 0.10, q: 'ceiling fan bldc', shops: ['flipkart', 'amazon'] },
    { name: 'Mattress and bedding', share: 0.13, q: 'queen mattress bedsheet set', shops: ['amazon', 'flipkart'] },
    { name: 'Rugs, curtains and decor', share: 0.10, q: 'curtains rug home decor', shops: ['ikea', 'amazon', 'pepper'] },
  ] },
  party: { title: 'Party or event', lines: [
    { name: 'Venue booking', share: 0.30, q: 'party hall booking', shops: ['mmt'] },
    { name: 'Food and beverages', share: 0.34, q: 'party catering order', shops: ['swiggy', 'zomato'] },
    { name: 'Decoration and theme', share: 0.15, q: 'birthday decoration kit', shops: ['amazon', 'flipkart'] },
    { name: 'Entertainment and music', share: 0.12, q: 'bluetooth party speaker', shops: ['amazon', 'flipkart'] },
    { name: 'Contingency buffer', share: 0.09, q: '', shops: [] },
  ] },
  jewellery: { title: 'Jewellery and gifting', lines: [
    { name: 'Statement piece', share: 0.44, q: 'gold necklace', shops: ['tanishq', 'bluestone'] },
    { name: 'Everyday earrings', share: 0.20, q: 'daily wear gold earrings', shops: ['bluestone', 'tanishq'] },
    { name: 'Chain or bracelet', share: 0.19, q: 'gold chain bracelet', shops: ['tanishq', 'bluestone'] },
    { name: 'Gift packaging', share: 0.06, q: 'jewellery gift box', shops: ['amazon'] },
    { name: 'Making charges buffer', share: 0.11, q: '', shops: [] },
  ] },
  travel: { title: 'Trip', lines: [
    { name: 'Travel and transit', share: 0.30, q: 'train flight booking', shops: ['irctc', 'mmt'] },
    { name: 'Stay', share: 0.29, q: 'hotel booking', shops: ['mmt'] },
    { name: 'Food', share: 0.19, q: 'restaurants near me', shops: ['zomato', 'swiggy'] },
    { name: 'Activities and entry tickets', share: 0.16, q: 'sightseeing tickets', shops: ['mmt'] },
    { name: 'Buffer', share: 0.06, q: '', shops: [] },
  ] },
  student: { title: 'Student starter kit', lines: [
    { name: 'Laptop or tablet', share: 0.46, q: 'budget laptop student', shops: ['amazon', 'flipkart'] },
    { name: 'Desk and chair', share: 0.18, q: 'study table chair', shops: ['ikea', 'pepper', 'flipkart'] },
    { name: 'Desk lamp and lighting', share: 0.06, q: 'led study lamp', shops: ['amazon', 'ikea'] },
    { name: 'Bag and stationery', share: 0.09, q: 'laptop backpack stationery', shops: ['flipkart', 'amazon'] },
    { name: 'Headphones', share: 0.11, q: 'wireless headphones', shops: ['amazon', 'flipkart'] },
    { name: 'Buffer for the first month', share: 0.10, q: '', shops: [] },
  ] },
};

export function buildPlan(kind, budget, style = 'balanced') {
  const tpl = PLAN_TEMPLATES[kind];
  const lines = tpl.lines.map((l) => ({ ...l }));

  if (style !== 'balanced') {
    const topIdx = lines.reduce((best, l, i) => (l.share > lines[best].share ? i : best), 0);
    const tilt = style === 'premium' ? 0.08 : -0.06;
    lines[topIdx].share += tilt;
    const others = lines.filter((_, i) => i !== topIdx);
    for (const l of others) l.share -= tilt / others.length;
    for (const l of lines) l.share = Math.max(l.share, 0.02);
    const total = lines.reduce((s, l) => s + l.share, 0);
    for (const l of lines) l.share /= total;
  }

  // Round each line to the nearest 10 and let the last line absorb the remainder so the plan
  // always adds up to the budget exactly.
  let allocated = 0;
  lines.forEach((l, i) => {
    l.amount = i === lines.length - 1 ? budget - allocated : Math.round((budget * l.share) / 10) * 10;
    allocated += l.amount;
  });

  return {
    kind, style, title: tpl.title, total: budget,
    lines: lines.map((l) => ({
      name: l.name,
      share: l.share,
      amount: l.amount,
      links: l.q ? l.shops.map((s) => ({ label: SHOPS[s].label, url: SHOPS[s].url + encodeURIComponent(l.q) })) : [],
    })),
  };
}

/* ------------------------------ sample data ------------------------------ */

const SAMPLE = [
  [2, 'Rent & Housing', 14000, 'Monthly rent'],
  [2, 'Savings & Investments', 5000, 'SIP into an index fund'],
  [3, 'Groceries', 2380, 'Monthly stock-up'],
  [4, 'Transport & Fuel', 1200, 'Metro pass'],
  [5, 'Utilities & Bills', 1840, 'Electricity and water'],
  [5, 'Subscriptions', 499, 'Music and cloud storage'],
  [6, 'Dining Out', 640, 'Team lunch'],
  [8, 'Shopping', 1899, 'Running shoes'],
  [9, 'Groceries', 720, 'Vegetables'],
  [10, 'Entertainment', 450, 'Cinema'],
  [11, 'Dining Out', 380, 'Late-night delivery'],
  [12, 'Health & Medicine', 560, 'Pharmacy'],
  [13, 'Transport & Fuel', 340, 'Cab to the station'],
  [14, 'Dining Out', 720, 'Birthday dinner'],
  [15, 'Savings & Investments', 2000, 'Emergency fund top-up'],
  [16, 'Groceries', 810, 'Vegetables and milk'],
  [17, 'Shopping', 2450, 'Headphones'],
  [18, 'Entertainment', 299, 'Gig ticket'],
  [19, 'Dining Out', 410, 'Delivery'],
  [20, 'Education', 1500, 'Online course'],
  [21, 'Transport & Fuel', 280, 'Cab'],
  [22, 'Groceries', 690, 'Weekly shop'],
  [23, 'Dining Out', 560, 'Cafe with friends'],
  [24, 'Subscriptions', 649, 'Streaming bundle'],
  [25, 'Shopping', 1250, 'Kurta'],
  [26, 'Dining Out', 495, 'Delivery'],
  [27, 'Groceries', 740, 'Weekly shop'],
  [28, 'Entertainment', 350, 'Bowling'],
  [29, 'Transport & Fuel', 260, 'Metro top-up'],
  [29, 'Dining Out', 380, 'Dinner out'],
];

export function prevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/**
 * The month the sample data lands in. Early in a month there are too few elapsed days to show
 * anything meaningful (on the 1st there are none), so the previous, complete month is used.
 */
export function sampleMonth(today) {
  return dayOf(today) < 10 ? prevMonth(monthOf(today)) : monthOf(today);
}

/** Sample entries for `sampleMonth(today)`, limited to days that have already happened. */
export function sampleTransactions(today) {
  const month = sampleMonth(today);
  const dim = daysInMonth(month);
  const lastDay = month === monthOf(today) ? dayOf(today) : dim;
  return SAMPLE.filter(([d]) => d <= lastDay && d <= dim).map(([d, cat, amount, note]) => ({
    date: `${month}-${pad(d)}`, cat, amount, note,
  }));
}

export const sampleBills = () => [
  { name: 'Rent', amount: 14000, day: 2 },
  { name: 'Electricity and water', amount: 1900, day: 5 },
  { name: 'SIP into an index fund', amount: 5000, day: 2 },
  { name: 'Streaming bundle', amount: 649, day: 24 },
];

export function sampleGoals(today) {
  const [y] = today.split('-').map(Number);
  return [
    { name: 'Emergency fund', target: 150000, saved: 62000, by: `${y + 1}-06-30` },
    { name: 'Laptop upgrade', target: 85000, saved: 24000, by: `${y + 1}-01-31` },
    { name: 'Trip to Kerala', target: 40000, saved: 11500, by: `${y + 1}-03-31` },
  ];
}
