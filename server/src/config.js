import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

const DEV_SECRET = 'dev-only-secret-change-me';
const jwtSecret = process.env.JWT_SECRET || DEV_SECRET;

if (isProd && (jwtSecret === DEV_SECRET || jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

export const config = {
  env,
  isProd,
  isTest: env === 'test',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pocketsmart',
  jwtSecret,
  jwtDays: Number(process.env.JWT_DAYS) || 7,
  // Comma-separated list of extra browser origins allowed to call the API (only needed when the
  // client is hosted on a different origin from the API).
  clientOrigins: (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Cookies are Secure (HTTPS only) in production. Set COOKIE_SECURE=false only when you run the
  // production build over plain HTTP, such as docker compose on localhost.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  // Set COOKIE_SAMESITE=none when client and API are on different sites (requires HTTPS).
  cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',
  bcryptRounds: env === 'test' ? 4 : 12,
};
