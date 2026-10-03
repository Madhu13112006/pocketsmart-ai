import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pocketsmart_test';

const { createApp } = await import('../src/app.js');
const { connectDb, disconnectDb } = await import('../src/db.js');
const mongoose = (await import('mongoose')).default;

const app = createApp();
const TODAY = '2026-09-30';

before(async () => {
  await connectDb(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});

let n = 0;
async function signUp(overrides = {}) {
  n += 1;
  const agent = request.agent(app);
  const body = { name: `Test User ${n}`, email: `user${n}@example.com`, password: 'correct-horse-9', ...overrides };
  const res = await agent.post('/api/auth/register').send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { agent, body, user: res.body.user };
}

/* ---------------------------------- auth ---------------------------------- */

test('register sets an httpOnly cookie and never returns the password hash', async () => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name: 'Asha', email: 'Asha@Example.com', password: 'longenough1' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'asha@example.com');
  assert.equal(res.body.user.passwordHash, undefined);
  assert.match(res.headers['set-cookie'][0], /ps_token=.+HttpOnly/i);
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.name, 'Asha');
});

test('register rejects weak passwords, bad emails and duplicates', async () => {
  assert.equal((await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await request(app).post('/api/auth/register').send({ name: 'A', email: 'not-an-email', password: 'longenough1' })).status, 400);
  const { body } = await signUp();
  const dup = await request(app).post('/api/auth/register').send({ ...body, email: body.email.toUpperCase() });
  assert.equal(dup.status, 409);
});

test('login works, fails generically, and resists operator injection', async () => {
  const { body } = await signUp();
  const ok = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
  assert.equal(ok.status, 200);
  const bad = await request(app).post('/api/auth/login').send({ email: body.email, password: 'wrong-password' });
  assert.equal(bad.status, 401);
  const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' });
  assert.equal(unknown.status, 401);
  assert.equal(bad.body.error, unknown.body.error);
  const inject = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
  assert.equal(inject.status, 400);
});

test('protected routes need a session; logout ends it', async () => {
  assert.equal((await request(app).get('/api/transactions')).status, 401);
  assert.equal((await request(app).get('/api/dashboard?month=2026-09&today=2026-09-30')).status, 401);
  const { agent } = await signUp();
  assert.equal((await agent.get('/api/transactions')).status, 200);
  await agent.post('/api/auth/logout');
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('a forged or tampered token is rejected', async () => {
  const res = await request(app).get('/api/auth/me').set('Cookie', 'ps_token=abc.def.ghi');
  assert.equal(res.status, 401);
  const bearer = await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope');
  assert.equal(bearer.status, 401);
});

test('change password requires the current one and the new one then works', async () => {
  const { agent, body } = await signUp();
  assert.equal((await agent.post('/api/auth/password').send({ current: 'wrong-wrong', next: 'brand-new-pass-1' })).status, 400);
  assert.equal((await agent.post('/api/auth/password').send({ current: body.password, next: 'brand-new-pass-1' })).status, 200);
  assert.equal((await request(app).post('/api/auth/login').send({ email: body.email, password: body.password })).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ email: body.email, password: 'brand-new-pass-1' })).status, 200);
});

/* ------------------------------ settings & meta ------------------------------ */

test('meta is public and lists categories with kinds', async () => {
  const res = await request(app).get('/api/meta');
  assert.equal(res.status, 200);
  assert.ok(res.body.categories.length >= 10);
  assert.ok(res.body.categories.every((c) => ['need', 'want', 'save'].includes(c.kind)));
});

test('settings update income, payday, currency and caps, and validate them', async () => {
  const { agent } = await signUp();
  const res = await agent.put('/api/settings').send({ income: 60000, payday: 5, currency: 'usd', caps: { Groceries: 7000 } });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.income, 60000);
  assert.equal(res.body.user.currency, 'usd');
  assert.equal(res.body.user.caps.Groceries, 7000);
  assert.equal(res.body.user.caps.Shopping, 4000, 'untouched caps keep their defaults');
  assert.equal((await agent.put('/api/settings').send({ payday: 40 })).status, 400);
  assert.equal((await agent.put('/api/settings').send({ income: -5 })).status, 400);
  assert.equal((await agent.put('/api/settings').send({ caps: { Nonsense: 5 } })).status, 400);
  assert.equal((await agent.put('/api/settings').send({ currency: 'xyz' })).status, 400);
});

/* ------------------------------- transactions ------------------------------- */

test('transactions: create, list by month and filter, update, delete', async () => {
  const { agent } = await signUp();
  const a = await agent.post('/api/transactions').send({ date: '2026-09-03', cat: 'Groceries', amount: 450.5, note: 'Milk' });
  assert.equal(a.status, 201);
  await agent.post('/api/transactions').send({ date: '2026-09-10', cat: 'Dining Out', amount: 800 });
  await agent.post('/api/transactions').send({ date: '2026-08-31', cat: 'Dining Out', amount: 999 });

  const sept = await agent.get('/api/transactions?month=2026-09');
  assert.equal(sept.body.transactions.length, 2);
  assert.equal(sept.body.transactions[0].date, '2026-09-10', 'newest first');
  assert.equal((await agent.get('/api/transactions?month=2026-09&cat=Groceries')).body.transactions.length, 1);
  assert.equal((await agent.get('/api/transactions?month=2026-09&kind=want')).body.transactions.length, 1);

  const id = a.body.transaction.id;
  const upd = await agent.put(`/api/transactions/${id}`).send({ date: '2026-09-04', cat: 'Groceries', amount: 500, note: 'Milk and eggs' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.transaction.amount, 500);
  assert.equal((await agent.delete(`/api/transactions/${id}`)).status, 200);
  assert.equal((await agent.get('/api/transactions?month=2026-09')).body.transactions.length, 1);
});

test('transactions reject bad dates, categories and amounts', async () => {
  const { agent } = await signUp();
  const ok = { date: '2026-09-03', cat: 'Groceries', amount: 10 };
  assert.equal((await agent.post('/api/transactions').send({ ...ok, date: '2026-02-31' })).status, 400);
  assert.equal((await agent.post('/api/transactions').send({ ...ok, date: '03/09/2026' })).status, 400);
  assert.equal((await agent.post('/api/transactions').send({ ...ok, cat: 'Gambling' })).status, 400);
  assert.equal((await agent.post('/api/transactions').send({ ...ok, amount: 0 })).status, 400);
  assert.equal((await agent.post('/api/transactions').send({ ...ok, amount: -4 })).status, 400);
  assert.equal((await agent.post('/api/transactions').send({ ...ok, amount: '12' })).status, 400);
  assert.equal((await agent.post('/api/transactions').send({ ...ok, note: 'x'.repeat(200) })).status, 400);
});

test('one user can never read, change or delete another user\'s data', async () => {
  const alice = await signUp();
  const bob = await signUp();

  const tx = (await alice.agent.post('/api/transactions').send({ date: '2026-09-03', cat: 'Groceries', amount: 100 })).body.transaction;
  const bill = (await alice.agent.post('/api/bills').send({ name: 'Rent', amount: 9000, day: 2 })).body.bill;
  const goal = (await alice.agent.post('/api/goals').send({ name: 'Bike', target: 20000, by: '2027-03-01' })).body.goal;

  assert.equal((await bob.agent.get('/api/transactions')).body.transactions.length, 0);
  assert.equal((await bob.agent.get('/api/bills')).body.bills.length, 0);
  assert.equal((await bob.agent.get(`/api/goals?today=${TODAY}`)).body.goals.length, 0);

  assert.equal((await bob.agent.put(`/api/transactions/${tx.id}`).send({ date: '2026-09-03', cat: 'Groceries', amount: 1 })).status, 404);
  assert.equal((await bob.agent.delete(`/api/transactions/${tx.id}`)).status, 404);
  assert.equal((await bob.agent.delete(`/api/bills/${bill.id}`)).status, 404);
  assert.equal((await bob.agent.put(`/api/goals/${goal.id}`).send({ name: 'Mine now' })).status, 404);
  assert.equal((await bob.agent.post(`/api/goals/${goal.id}/contribute`).send({ amount: 5, date: TODAY })).status, 404);
  assert.equal((await bob.agent.delete(`/api/goals/${goal.id}`)).status, 404);

  // Alice's data is untouched.
  assert.equal((await alice.agent.get('/api/transactions')).body.transactions[0].amount, 100);
  assert.equal((await alice.agent.get('/api/bills')).body.bills.length, 1);
});

test('malformed ids return 404 rather than crashing', async () => {
  const { agent } = await signUp();
  assert.equal((await agent.delete('/api/transactions/not-an-id')).status, 404);
  assert.equal((await agent.delete('/api/transactions/000000000000000000000000')).status, 404);
});

test('CSV export neutralises spreadsheet formulas and only contains your rows', async () => {
  const { agent } = await signUp();
  const other = await signUp();
  await other.agent.post('/api/transactions').send({ date: '2026-09-01', cat: 'Groceries', amount: 1, note: 'not yours' });
  await agent.post('/api/transactions').send({ date: '2026-09-03', cat: 'Shopping', amount: 99, note: '=HYPERLINK("http://evil")' });
  await agent.post('/api/transactions').send({ date: '2026-09-04', cat: 'Shopping', amount: 5, note: 'a, "quoted" note' });
  const res = await agent.get('/api/export.csv');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.text, /^date,category,type,amount,note\n/);
  assert.ok(res.text.includes(`"'=HYPERLINK(""http://evil"")"`), res.text);
  assert.ok(res.text.includes('"a, ""quoted"" note"'));
  assert.ok(!res.text.includes('not yours'));
});

/* --------------------------- bills, goals, dashboard --------------------------- */

test('bills validate their day and can be removed', async () => {
  const { agent } = await signUp();
  assert.equal((await agent.post('/api/bills').send({ name: 'Net', amount: 700, day: 32 })).status, 400);
  const b = await agent.post('/api/bills').send({ name: 'Net', amount: 700, day: 12 });
  assert.equal(b.status, 201);
  assert.equal((await agent.delete(`/api/bills/${b.body.bill.id}`)).status, 200);
});

test('goals: monthly need is calculated and a contribution also logs a savings entry', async () => {
  const { agent } = await signUp();
  const created = await agent.post('/api/goals').send({ name: 'Laptop', target: 60000, saved: 12000, by: '2027-01-31' });
  assert.equal(created.status, 201);
  const list = await agent.get(`/api/goals?today=${TODAY}`);
  const g = list.body.goals[0];
  assert.equal(g.monthsLeft, 4); // Oct, Nov, Dec, Jan
  assert.equal(g.monthly, 12000); // (60000-12000)/4

  const c = await agent.post(`/api/goals/${g.id}/contribute`).send({ amount: 3000, date: TODAY });
  assert.equal(c.status, 201);
  assert.equal(c.body.goal.saved, 15000);
  const tx = (await agent.get('/api/transactions?month=2026-09')).body.transactions;
  assert.equal(tx.length, 1);
  assert.equal(tx[0].cat, 'Savings & Investments');
  assert.equal((await agent.post(`/api/goals/${g.id}/contribute`).send({ amount: -1, date: TODAY })).status, 400);
});

test('demo seed fills an empty account once and the dashboard maths reconciles', async () => {
  const { agent } = await signUp();
  const empty = await agent.get(`/api/dashboard?month=2026-09&today=${TODAY}`);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.hasAnyData, false);
  assert.equal(empty.body.metrics.outflow, 0);
  assert.ok(empty.body.insights.length >= 1);

  assert.equal((await agent.post('/api/demo/seed').send({ today: TODAY })).status, 201);
  assert.equal((await agent.post('/api/demo/seed').send({ today: TODAY })).status, 409, 'cannot seed twice');

  const d = (await agent.get(`/api/dashboard?month=2026-09&today=${TODAY}`)).body;
  const m = d.metrics;
  assert.equal(d.hasAnyData, true);
  assert.equal(m.income, 48000);
  assert.equal(Math.round(m.outflow), 36751);
  assert.equal(Math.round(m.byKind.save), 7000);
  assert.equal(Math.round(m.left), 4249);
  assert.equal(Math.round(m.outflow + m.byKind.save + m.left), 48000, 'spent + saved + left equals income');
  assert.equal(m.byKind.need + m.byKind.want, m.outflow);
  assert.equal(m.dim, 30);
  assert.equal(m.elapsed, 30);
  assert.equal(Math.round(m.projected), 36751);
  assert.equal(d.cumulative.length, 31);
  assert.equal(Math.round(d.cumulative[30]), 43751);
  const catSum = d.categories.reduce((s, c) => s + c.spent, 0);
  assert.equal(Math.round(catSum), 43751);
  assert.ok(d.insights.some((i) => /over its cap/.test(i.title)));

  // A past month with no entries is quiet rather than wrong.
  const aug = (await agent.get(`/api/dashboard?month=2026-08&today=${TODAY}`)).body;
  assert.equal(aug.metrics.outflow, 0);
  assert.equal(aug.metrics.elapsed, 31);
});

test('demo seed on the 1st lands in the previous complete month so it is never empty', async () => {
  const { agent } = await signUp();
  const res = await agent.post('/api/demo/seed').send({ today: '2026-10-01' });
  assert.equal(res.status, 201);
  assert.equal(res.body.month, '2026-09');
  assert.equal(res.body.user.income, 48000, 'the response carries the updated income');
  const sept = (await agent.get('/api/dashboard?month=2026-09&today=2026-10-01')).body;
  assert.equal(Math.round(sept.metrics.outflow), 36751);
  assert.equal(sept.metrics.elapsed, 30);
  const jan = await signUp();
  const r2 = await jan.agent.post('/api/demo/seed').send({ today: '2027-01-03' });
  assert.equal(r2.body.month, '2026-12', 'rolls back across the year boundary');
});

test('dashboard honours the client\'s today for days-to-payday and upcoming bills', async () => {
  const { agent } = await signUp();
  await agent.put('/api/settings').send({ income: 50000, payday: 1 });
  await agent.post('/api/bills').send({ name: 'Rent', amount: 15000, day: 2 });
  await agent.post('/api/bills').send({ name: 'Net', amount: 800, day: 25 });
  const d = (await agent.get('/api/dashboard?month=2026-09&today=2026-09-10')).body;
  assert.equal(d.metrics.daysToPayday, 21); // 20 days left in September + payday on the 1st
  assert.equal(d.metrics.upcoming, 800); // the 2nd has passed
  assert.equal(d.upcomingBills.length, 1);
});

test('dashboard rejects malformed month and today', async () => {
  const { agent } = await signUp();
  assert.equal((await agent.get('/api/dashboard?month=2026-13&today=2026-09-30')).status, 400);
  assert.equal((await agent.get('/api/dashboard?month=2026-09')).status, 400);
  assert.equal((await agent.get('/api/dashboard?month=2026-09&today=yesterday')).status, 400);
});

/* ------------------------------- advice tools ------------------------------- */

test('affordability: a small need passes, a huge want is refused, and bad input is rejected', async () => {
  const { agent } = await signUp();
  await agent.post('/api/demo/seed').send({ today: '2026-09-10' });
  const small = await agent.post('/api/afford').send({ item: 'Pharmacy', amount: 300, cat: 'Health & Medicine', when: 'now', today: '2026-09-10' });
  assert.equal(small.status, 200);
  const huge = await agent.post('/api/afford').send({ item: 'Sofa', amount: 250000, cat: 'Shopping', when: 'later', today: '2026-09-10' });
  assert.ok(small.body.result.score > huge.body.result.score);
  assert.equal(huge.body.result.band.key, 'skip');
  assert.equal(huge.body.result.signals.length, 5);
  assert.ok(huge.body.result.score >= 0 && huge.body.result.score <= 100);
  assert.equal((await agent.post('/api/afford').send({ item: '', amount: 5, cat: 'Shopping', today: TODAY })).status, 400);
  assert.equal((await agent.post('/api/afford').send({ item: 'x', amount: 5, cat: 'Nope', today: TODAY })).status, 400);
});

test('planner allocates the budget exactly for every occasion and priority', async () => {
  const { agent } = await signUp();
  for (const kind of ['home', 'party', 'jewellery', 'travel', 'student']) {
    for (const style of ['balanced', 'value', 'premium']) {
      for (const budget of [1000, 8000, 50000, 123457]) {
        const res = await agent.post('/api/plan').send({ kind, budget, style });
        assert.equal(res.status, 200);
        const total = res.body.plan.lines.reduce((s, l) => s + l.amount, 0);
        assert.equal(total, budget, `${kind}/${style}/${budget}`);
        assert.ok(res.body.plan.lines.every((l) => l.amount > 0), `${kind}/${style}/${budget} has a non-positive line`);
      }
    }
  }
  const home = (await agent.post('/api/plan').send({ kind: 'home', budget: 50000 })).body.plan;
  assert.ok(home.lines[0].links.every((l) => l.url.startsWith('https://')));
  assert.equal((await agent.post('/api/plan').send({ kind: 'yacht', budget: 50000 })).status, 400);
  assert.equal((await agent.post('/api/plan').send({ kind: 'home', budget: 10 })).status, 400);
});

/* --------------------------------- lifecycle --------------------------------- */

test('clearing data keeps the account; deleting the account removes everything', async () => {
  const { agent, body, user } = await signUp();
  await agent.post('/api/demo/seed').send({ today: TODAY });
  assert.equal((await agent.delete('/api/data')).status, 200);
  assert.equal((await agent.get('/api/transactions')).body.transactions.length, 0);
  assert.equal((await agent.get('/api/auth/me')).status, 200);

  await agent.post('/api/transactions').send({ date: TODAY, cat: 'Groceries', amount: 10 });
  assert.equal((await agent.post('/api/auth/delete-account').send({ password: 'wrong-pass-1' })).status, 400);
  assert.equal((await agent.post('/api/auth/delete-account').send({ password: body.password })).status, 200);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ email: body.email, password: body.password })).status, 401);
  assert.equal(await mongoose.models.Transaction.countDocuments({ user: user.id }), 0);
});

test('unknown API routes 404 as JSON when signed in; invalid JSON is a 400', async () => {
  assert.equal((await request(app).get('/api/nope')).status, 401);
  const { agent } = await signUp();
  const miss = await agent.get('/api/nope');
  assert.equal(miss.status, 404);
  assert.equal(miss.body.error, 'Not found');
  const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{not json');
  assert.equal(bad.status, 400);
});
