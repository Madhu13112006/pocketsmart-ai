import { Router } from 'express';
import { Transaction } from '../models/Transaction.js';
import { Bill } from '../models/Bill.js';
import { Goal } from '../models/Goal.js';
import { schemas } from '../lib/schemas.js';
import { CATEGORIES, CURRENCIES, KIND_OF, DEFAULT_CAPS } from '../lib/categories.js';
import {
  computeMetrics, categoryRows, buildInsights, evaluateAffordability, buildPlan, PLAN_TEMPLATES,
  goalMonthly, monthsUntil, monthOf, sampleMonth, sampleTransactions, sampleBills, sampleGoals,
} from '../lib/engine.js';
import { HttpError, parse, requireAuth, findOwned } from '../middleware/http.js';

const router = Router();

/* Public reference data used by the client to build forms. */
router.get('/meta', (_req, res) => {
  res.json({
    categories: CATEGORIES,
    currencies: CURRENCIES,
    plans: Object.entries(PLAN_TEMPLATES).map(([kind, t]) => ({ kind, title: t.title })),
  });
});

router.get('/health', (_req, res) => res.json({ ok: true }));

// Everything below belongs to the signed-in user.
router.use(requireAuth);

const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });
const settingsOf = (user) => ({
  currency: user.currency,
  income: user.income,
  payday: user.payday,
  caps: { ...DEFAULT_CAPS, ...Object.fromEntries(user.caps ?? []) },
});

/* ------------------------------- settings ------------------------------- */

router.get('/settings', (req, res) => res.json({ user: req.user.toPublic() }));

router.put('/settings', async (req, res) => {
  const data = parse(schemas.settings, req.body);
  const { user } = req;
  if (data.name !== undefined) user.name = data.name;
  if (data.currency !== undefined) user.currency = data.currency;
  if (data.income !== undefined) user.income = data.income;
  if (data.payday !== undefined) user.payday = data.payday;
  if (data.caps) for (const [name, value] of Object.entries(data.caps)) user.caps.set(name, value);
  await user.save();
  res.json({ user: user.toPublic() });
});

/* ----------------------------- transactions ----------------------------- */

router.get('/transactions', async (req, res) => {
  const q = parse(schemas.transactionQuery, req.query);
  const filter = { user: req.user._id };
  if (q.month) filter.date = monthRange(q.month);
  if (q.cat) filter.cat = q.cat;
  else if (q.kind) filter.cat = { $in: CATEGORIES.filter((c) => c.kind === q.kind).map((c) => c.name) };
  const rows = await Transaction.find(filter).sort({ date: -1, createdAt: -1 }).limit(2000);
  res.json({ transactions: rows.map((t) => t.toPublic()) });
});

router.post('/transactions', async (req, res) => {
  const data = parse(schemas.transaction, req.body);
  const tx = await Transaction.create({ ...data, user: req.user._id });
  res.status(201).json({ transaction: tx.toPublic() });
});

router.put('/transactions/:id', async (req, res) => {
  const data = parse(schemas.transaction, req.body);
  const tx = await findOwned(Transaction, req);
  Object.assign(tx, data);
  await tx.save();
  res.json({ transaction: tx.toPublic() });
});

router.delete('/transactions/:id', async (req, res) => {
  const tx = await findOwned(Transaction, req);
  await tx.deleteOne();
  res.json({ ok: true });
});

const csvCell = (value) => {
  let s = String(value ?? '');
  // Stop spreadsheet apps treating user text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/export.csv', async (req, res) => {
  const rows = await Transaction.find({ user: req.user._id }).sort({ date: 1, createdAt: 1 });
  const lines = ['date,category,type,amount,note'];
  for (const t of rows) lines.push([t.date, t.cat, KIND_OF[t.cat], t.amount, t.note].map(csvCell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pocketsmart-transactions.csv"');
  res.send(`${lines.join('\n')}\n`);
});

/* --------------------------------- bills --------------------------------- */

router.get('/bills', async (req, res) => {
  const rows = await Bill.find({ user: req.user._id }).sort({ day: 1 });
  res.json({ bills: rows.map((b) => b.toPublic()) });
});

router.post('/bills', async (req, res) => {
  const data = parse(schemas.bill, req.body);
  const bill = await Bill.create({ ...data, user: req.user._id });
  res.status(201).json({ bill: bill.toPublic() });
});

router.delete('/bills/:id', async (req, res) => {
  const bill = await findOwned(Bill, req);
  await bill.deleteOne();
  res.json({ ok: true });
});

/* --------------------------------- goals --------------------------------- */

router.get('/goals', async (req, res) => {
  const today = parse(schemas.seed, req.query).today;
  const rows = await Goal.find({ user: req.user._id }).sort({ by: 1 });
  res.json({
    goals: rows.map((g) => {
      const goal = g.toPublic();
      return { ...goal, monthly: goalMonthly(goal, today), monthsLeft: monthsUntil(goal.by, today) };
    }),
  });
});

router.post('/goals', async (req, res) => {
  const data = parse(schemas.goal, req.body);
  const goal = await Goal.create({ ...data, user: req.user._id });
  res.status(201).json({ goal: goal.toPublic() });
});

router.put('/goals/:id', async (req, res) => {
  const data = parse(schemas.goalUpdate, req.body);
  const goal = await findOwned(Goal, req);
  Object.assign(goal, data);
  await goal.save();
  res.json({ goal: goal.toPublic() });
});

router.post('/goals/:id/contribute', async (req, res) => {
  const { amount, date } = parse(schemas.contribution, req.body);
  const goal = await findOwned(Goal, req);
  goal.saved += amount;
  await goal.save();
  // A contribution is money set aside, so it also counts toward this month's savings.
  const tx = await Transaction.create({
    user: req.user._id, date, cat: 'Savings & Investments', amount, note: `Goal: ${goal.name}`.slice(0, 80),
  });
  res.status(201).json({ goal: goal.toPublic(), transaction: tx.toPublic() });
});

router.delete('/goals/:id', async (req, res) => {
  const goal = await findOwned(Goal, req);
  await goal.deleteOne();
  res.json({ ok: true });
});

/* ------------------------- dashboard and advice ------------------------- */

router.get('/dashboard', async (req, res) => {
  const { month, today } = parse(schemas.dashboardQuery, req.query);
  const settings = settingsOf(req.user);
  const [txns, bills, goals, total] = await Promise.all([
    Transaction.find({ user: req.user._id, date: monthRange(month) }),
    Bill.find({ user: req.user._id }),
    Goal.find({ user: req.user._id }),
    Transaction.countDocuments({ user: req.user._id }),
  ]);
  const billData = bills.map((b) => b.toPublic());
  const goalData = goals.map((g) => g.toPublic());
  const metrics = computeMetrics({
    settings, month, today, txns: txns.map((t) => t.toPublic()), bills: billData, goals: goalData,
  });

  const cumulative = [0];
  let run = 0;
  for (let d = 1; d <= metrics.dim; d++) {
    run += metrics.byDay[d];
    cumulative.push(run);
  }

  res.json({
    month, today,
    hasAnyData: total > 0,
    metrics,
    cumulative,
    categories: categoryRows(metrics, settings.caps),
    insights: buildInsights({ metrics, settings, goals: goalData }),
    upcomingBills: metrics.isCurrent ? billData.filter((b) => b.day > Number(today.slice(8, 10))) : [],
  });
});

router.post('/afford', async (req, res) => {
  const { item, amount, cat, when, today } = parse(schemas.afford, req.body);
  const settings = settingsOf(req.user);
  const month = monthOf(today);
  const [txns, bills, goals] = await Promise.all([
    Transaction.find({ user: req.user._id, date: monthRange(month) }),
    Bill.find({ user: req.user._id }),
    Goal.find({ user: req.user._id }),
  ]);
  const metrics = computeMetrics({
    settings, month, today,
    txns: txns.map((t) => t.toPublic()),
    bills: bills.map((b) => b.toPublic()),
    goals: goals.map((g) => g.toPublic()),
  });
  res.json({ result: evaluateAffordability({ metrics, settings, item, amount, cat, when }) });
});

router.post('/plan', async (req, res) => {
  const { kind, budget, style } = parse(schemas.plan, req.body);
  const plan = buildPlan(kind, budget, style);
  const settings = settingsOf(req.user);
  const savingsSlice = settings.income * 0.2;
  res.json({
    plan,
    context: {
      income: settings.income,
      shareOfIncome: settings.income > 0 ? (budget / settings.income) * 100 : null,
      monthsOfSavings: savingsSlice > 0 ? Math.ceil(budget / savingsSlice) : null,
    },
  });
});

/* ------------------------------ demo and reset ------------------------------ */

router.post('/demo/seed', async (req, res) => {
  const { today } = parse(schemas.seed, req.body);
  if (await Transaction.exists({ user: req.user._id })) {
    throw new HttpError(409, 'Sample data can only be added to an empty account');
  }
  const { user } = req;
  if (!user.income) user.income = 48000;
  await user.save();
  const uid = user._id;
  await Transaction.insertMany(sampleTransactions(today).map((t) => ({ ...t, user: uid })));
  if (!(await Bill.exists({ user: uid }))) await Bill.insertMany(sampleBills().map((b) => ({ ...b, user: uid })));
  if (!(await Goal.exists({ user: uid }))) await Goal.insertMany(sampleGoals(today).map((g) => ({ ...g, user: uid })));
  res.status(201).json({ ok: true, month: sampleMonth(today), user: user.toPublic() });
});

router.delete('/data', async (req, res) => {
  const uid = req.user._id;
  await Promise.all([
    Transaction.deleteMany({ user: uid }),
    Bill.deleteMany({ user: uid }),
    Goal.deleteMany({ user: uid }),
  ]);
  res.json({ ok: true });
});

export default router;
