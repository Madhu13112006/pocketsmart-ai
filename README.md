# 💰 PocketSmart AI

**A budget and recommendation assistant built on the MERN stack.**

Create an account, log what you spend, and PocketSmart tells you where the month is heading: spending against the 50/30/20 rule, a projection to month end, savings goals with the monthly amount each one needs, a "can I afford this?" score, and an occasion-based budget planner.

![Node](https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Run with Docker](#run-with-docker)
- [Production build](#production-build-without-docker)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [How the recommendations work](#how-the-recommendations-work)
- [Security](#security)
- [Tests](#tests)
- [Project structure](#project-structure)

---

## Features

| Area | What you get |
| ---- | ------------ |
| **Accounts** | Register, sign in, sign out, change password, export data as CSV, clear data, delete account |
| **Expenses (Ledger)** | Add, edit, delete, and filter by month, category and type (need, want, savings) |
| **Dashboard** | Live 50/30/20 meters, spend-pace and daily charts, projected month-end spend, free cash before payday, category caps, ranked insights |
| **Budget** | Income, payday, currency (INR, USD, EUR, GBP), per-category caps, fixed bills |
| **Goals** | Target, deadline, progress, and the monthly contribution each goal needs. Contributions also count as savings |
| **Can I afford it?** | A 0 to 100 score from five weighted signals, the reasoning, and cheaper alternatives |
| **Budget planner** | Splits a total across line items for a home, party, jewellery, trip or student kit, in balanced, value or premium style, with retailer search links |

Every user's data is isolated. Each query is scoped to the signed-in user, and the test suite checks that one user cannot read, edit or delete another's records.

## Tech stack

| Layer | Tech |
| ----- | ---- |
| Database | MongoDB with Mongoose |
| API | Node.js 20+, Express 5, JWT in an httpOnly cookie, bcrypt, zod validation, helmet, rate limiting |
| Client | React 19, React Router, Vite. Charts are hand-drawn SVG, so there is no chart library |
| Tooling | Docker (multi-stage build), Docker Compose, Node's built-in test runner with supertest |

## Quick start

**Prerequisites:** Node 20+ and a MongoDB instance. Any of these works:

```bash
# Option 1: a local container
docker run -d -p 27017:27017 --name pocketsmart-mongo mongo:7

# Option 2: install MongoDB Community
# Option 3: use a free MongoDB Atlas cluster and put its URI in server/.env
```

**Then:**

```bash
npm run install:all                 # installs root, server and client dependencies
cp server/.env.example server/.env  # defaults work for local development
npm run dev                         # API on :5000, web app on http://localhost:5173
```

Open <http://localhost:5173>, create an account, and press **Load sample month** on the dashboard to see it with data.

## Run with Docker

App and database together, one command:

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
# open http://localhost:5000
```

## Production build without Docker

```bash
npm run install:all
npm run build                       # builds client/dist
NODE_ENV=production JWT_SECRET=<48+ random hex chars> MONGODB_URI=<your uri> npm start
```

Express serves the built React app and the API from one origin, so the session cookie stays first-party. Put it behind HTTPS (Render, Railway, Fly.io, or a VPS with Caddy or nginx).

In production the cookie is `Secure`, and the server refuses to start without a strong `JWT_SECRET`. Set `COOKIE_SECURE=false` only if you deliberately run it over plain HTTP.

## Configuration

Set these in `server/.env` (copy from `server/.env.example`):

| Variable | Purpose |
| -------- | ------- |
| `MONGODB_URI` | Connection string. Default `mongodb://127.0.0.1:27017/pocketsmart` |
| `JWT_SECRET` | Signs session tokens. Required in production, 32+ characters |
| `JWT_DAYS` | Session length in days. Default `7` |
| `PORT` | Default `5000` |
| `CLIENT_ORIGIN` | Only if the client is on a different origin. Comma-separated. Also needs `COOKIE_SAMESITE=none` and HTTPS |
| `COOKIE_SECURE` | Override the Secure flag (default: on in production) |
| `COOKIE_SAMESITE` | Default `lax`. Use `none` for cross-site hosting (requires HTTPS) |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## API reference

All routes live under `/api`. Everything except `/meta`, `/health` and `/auth/register|login|logout` needs a session.

Dates are `YYYY-MM-DD` and months are `YYYY-MM`. The client sends its own `today`, so results never shift with server time zones.

| Method and path | Purpose |
| --------------- | ------- |
| `POST /auth/register` · `/auth/login` · `/auth/logout` | Account session |
| `GET /auth/me` | Current user |
| `POST /auth/password` · `/auth/delete-account` | Change password, delete account |
| `GET /meta` | Categories, currencies and planner types (public) |
| `GET /health` | Health check (public) |
| `GET` `PUT /settings` | Name, currency, income, payday, category caps |
| `GET` `POST /transactions` · `PUT` `DELETE /transactions/:id` | Expenses. Filter with `?month=&cat=&kind=` |
| `GET /export.csv` | All expenses as CSV |
| `GET` `POST /bills` · `DELETE /bills/:id` | Fixed bills |
| `GET` `POST /goals` · `PUT` `DELETE /goals/:id` · `POST /goals/:id/contribute` | Savings goals |
| `GET /dashboard?month=&today=` | Metrics, chart series, category rows, insights |
| `POST /afford` | Affordability score and reasoning |
| `POST /plan` | Budget planner |
| `POST /demo/seed` · `DELETE /data` | Load sample data, clear everything |

## How the recommendations work

The advice comes from a **rule-based engine** in `server/src/lib/engine.js`, not from a language model. It is made of pure functions, so every figure can be reproduced from the entries behind it.

**The affordability score** (0 to 100) combines five weighted signals:

| Signal | Weight |
| ------ | -----: |
| Cash left before payday after the purchase | 35 |
| Headroom left in the category cap | 25 |
| Daily spending room until payday | 20 |
| Effect on savings goals | 10 |
| Need vs want, and how soon you'd buy | 10 |

The score maps to one of four verdicts: **Go ahead** (75+), **Yes, with a plan** (55+), **Wait for payday** (35+), or **Skip it this month**.

Want generated text on top? The natural place is `buildInsights` and `buildPlan`: keep the numbers from the engine and ask a model only to phrase them.

## Security

- Passwords are hashed with bcrypt (12 rounds). Login runs a dummy comparison for unknown emails so timing does not reveal which addresses exist.
- The session is a JWT in an `httpOnly`, `SameSite=Lax` cookie, so page scripts cannot read it and cross-site form posts do not carry it.
- Input is validated with zod before it touches the database. Non-string values for email or password are rejected, which blocks NoSQL operator injection.
- Auth endpoints are rate limited. Helmet sets a strict Content-Security-Policy and other headers.
- CSV export neutralises cells that start with `=`, `+`, `-` or `@` so spreadsheet apps do not run them as formulas.
- Request bodies are capped at 100 KB.

## Tests

```bash
npm test
```

23 API integration tests. They need a MongoDB at `MONGODB_URI` (default `127.0.0.1:27017`, database `pocketsmart_test`).

They cover registration and login rules, token tampering, operator injection, cross-user isolation, validation, the dashboard arithmetic (spent + saved + left equals income), goal maths, CSV safety, the planner (allocations always sum to the budget exactly), and account deletion.

## Project structure

```
pocketsmart-ai/
├── Dockerfile                 # multi-stage: build client, then serve API + client
├── docker-compose.yml         # app + MongoDB
├── package.json               # root scripts: install:all, dev, build, start, test
├── server/
│   ├── .env.example
│   ├── src/
│   │   ├── index.js · app.js · config.js · db.js
│   │   ├── models/            # User, Transaction, Bill, Goal
│   │   ├── routes/            # auth.js, api.js
│   │   ├── middleware/        # http.js (auth, validation, errors)
│   │   └── lib/               # engine.js (the maths), categories.js, schemas.js
│   └── test/api.test.js
└── client/
    ├── vite.config.js
    └── src/
        ├── pages/             # Auth, Dashboard, Ledger, Budget, Goals, Afford, Planner, Account
        ├── components/        # Layout, Charts, ui
        └── lib/               # api.js, context.jsx, dates.js
```
