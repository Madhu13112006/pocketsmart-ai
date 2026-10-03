import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import { errorHandler, notFound } from './middleware/http.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = process.env.CLIENT_DIST || path.resolve(here, '../../client/dist');

export function createApp() {
  const app = express();
  if (config.isProd) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // HSTS and upgrade-insecure-requests only make sense over HTTPS; on plain HTTP they would make
  // the browser refuse to load the app's own assets.
  app.use(helmet({
    hsts: config.cookieSecure,
    contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': config.cookieSecure ? [] : null } },
  }));
  app.use(compression());
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));
  if (config.clientOrigins.length) app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/api', notFound);

  // In production the built React app is served from the same origin as the API, which keeps the
  // session cookie first-party.
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
