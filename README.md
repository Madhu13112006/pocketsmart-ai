# PocketSmart AI

A budget and recommendation assistant built on the MERN stack. People create an account, log what
they spend, and PocketSmart tells them where the month is heading: spending against the 50/30/20
rule, a projection to month end, savings goals with the monthly amount each one needs, a "can I
afford this?" score, and an occasion-based budget planner.

| Layer    | Tech |
| -------- | ---- |
| Database | MongoDB with Mongoose |
| API      | Node.js 20+, Express 5, JWT in an httpOnly cookie, bcrypt, zod validation, helmet, rate limiting |
| Client   | React 19, React Router, Vite. Charts are hand-drawn SVG, so there is no chart library |

## What users can do

- **Accounts**: register, sign in, sign out, change password, export their data as CSV, clear their data, delete their account.
- **Expenses**: add, edit, delete and filter by month, category and type (need, want, savings).
- **Dashboard**: live 50/30/20 meters, spend-pace and daily charts, projected month-end spend, free cash before payday, category caps, and ranked insights.
- **Budget**: income, payday, currency (INR, USD, EUR, GBP), per-category caps, fixed bills.
- **Goals**: target, deadline, progress, and the monthly contribution each one needs. Contributions also count as savings.
- **Can I afford it?**: a 0 to 100 score from five weighted signals, the reasoning, and cheaper alternatives.
- **Budget planner**: splits a total across line items for a home, party, jewellery, trip or student kit, with retailer search links.

Every user's data is isolated. Each query is scoped to the signed-in user, and the test suite checks that one user cannot read, edit or delete another's records.

## Run it locally

You need Node 20+ and a MongoDB. Any of these works:

```bash
docker run -d -p 27017:27017 --name pocketsmart-mongo mongo:7   # local container
# or install MongoDB Community, or use a free MongoDB Atlas cluster and put its URI in .env
```

```bash
npm run install:all
cp server/.env.example server/.env      # defaults work for local development
npm run dev                             # API on :5000, web app on http://localhost:5173
```

Open http://localhost:5173, create an account, and press **Load sample month** on the dashboard to see it with data.

## Run it with Docker (app and database together)

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
# open http://localhost:5000
```

## Production build without Docker

```bash
npm run install:all
npm run build                 # builds client/dist
NODE_ENV=production JWT_SECRET=<48+ random hex chars> MONGODB_URI=<your uri> npm start
```

Express serves the built React app and the API from one origin, so the session cookie stays first-party.
Put it behind HTTPS (Render, Railway, Fly.io, a VPS with Caddy or nginx). In production the cookie is
`Secure`, and the server refuses to start without a strong `JWT_SECRET`. Set `COOKIE_SECURE=false`
only if you deliberately run it over plain HTTP.

## Configuration (`server/.env`)

| Variable | Purpose |
| -------- | ------- |
| `MONGODB_URI` | Connection string. Default `mongodb://127.0.0.1:27017/pocketsmart` |
| `JWT_SECRET` | Signs session tokens. Required in production, 32+ characters |
| `JWT_DAYS` | Session length in days. Default 7 |
| `PORT` | Default 5000 |
| `CLIENT_ORIGIN` | Only if the client is on a different origin. Comma-separated. Also needs `COOKIE_SAMESITE=none` and HTTPS |
| `COOKIE_SECURE` | Override the Secure flag (default: on in production) |

## API

All routes are under `/api`. Everything except `/meta`, `/health` and `/auth/register|login|logout` needs a session.
Dates are `YYYY-MM-DD` and months are `YYYY-MM`. The client sends its own `today`, so results never shift with server time zones.

| Method and path | Purpose |
| --------------- | ------- |
| `POST /auth/register` `/auth/login` `/auth/logout` | Account session |
| `GET /auth/me` | Current user |
| `POST /auth/password` `/auth/delete-account` | Change password, delete account |
| `GET PUT /settings` | Name, currency, income, payday, category caps |
| `GET POST /transactions`, `PUT DELETE /transactions/:id` | Expenses. Filter with `?month=&cat=&kind=` |
| `GET /export.csv` | All expenses as CSV |
| `GET POST /bills`, `DELETE /bills/:id` | Fixed bills |
| `GET POST /goals`, `PUT DELETE /goals/:id`, `POST /goals/:id/contribute` | Savings goals |
| `GET /dashboard?month=&today=` | Metrics, chart series, category rows, insights |
| `POST /afford` | Affordability score and reasoning |
| `POST /plan` | Budget planner |
| `POST /demo/seed`, `DELETE /data` | Load sample data, clear everything |

## Security notes

- Passwords are hashed with bcrypt (12 rounds). Login runs a dummy comparison for unknown emails so timing does not reveal which addresses exist.
- The session is a JWT in an `httpOnly`, `SameSite=Lax` cookie, so page scripts cannot read it and cross-site form posts do not carry it.
- Input is validated with zod before it touches the database. Non-string values for email or password are rejected, which blocks NoSQL operator injection.
- Auth endpoints are rate limited. Helmet sets a strict Content-Security-Policy and other headers.
- CSV export neutralises cells that start with `=`, `+`, `-` or `@` so spreadsheet apps do not run them as formulas.

## Tests

```bash
npm test      # 23 API integration tests; needs a MongoDB at MONGODB_URI (default 127.0.0.1:27017, database pocketsmart_test)
```

They cover registration and login rules, token tampering, operator injection, cross-user isolation,
validation, the dashboard arithmetic (spent + saved + left equals income), goal maths, CSV safety,
the planner (allocations always sum to the budget exactly), and account deletion.

## How the recommendations work

The advice comes from a rule-based engine in `server/src/lib/engine.js`, not from a language model.
It is made of pure functions, so every figure can be reproduced from the entries behind it.
If you want generated text on top, the natural place is `buildInsights` and `buildPlan`: keep the
numbers from the engine and ask a model only to phrase them.

## Project layout

```
server/src
  config.js  db.js  app.js  index.js
  models/       User, Transaction, Bill, Goal
  routes/       auth.js, api.js
  middleware/   http.js (auth, validation, errors)
  lib/          engine.js (the maths), categories.js, schemas.js
server/test     api.test.js
client/src
  pages/        Auth, Dashboard, Ledger, Budget, Goals, Afford, Planner, Account
  components/   Layout, Charts, ui
  lib/          api.js, context.jsx, dates.js
```
