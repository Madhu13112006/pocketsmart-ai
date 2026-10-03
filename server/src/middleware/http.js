import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { User } from '../models/User.js';

export const COOKIE = 'ps_token';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Parse `source` with a zod schema, replacing zod's issue list with a readable 400. */
export function parse(schema, source) {
  const result = schema.safeParse(source ?? {});
  if (result.success) return result.data;
  const details = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!details[key]) details[key] = issue.message;
  }
  const first = Object.values(details)[0];
  throw new HttpError(400, first || 'Invalid input', details);
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.jwtDays}d` });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAge: config.jwtDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/' });
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  const token = req.cookies?.[COOKIE] || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) throw new HttpError(401, 'Sign in to continue');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Your session has expired. Sign in again.');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, 'Your session has expired. Sign in again.');
  req.user = user;
  next();
}

/** Resolve a :id route param to a document owned by the signed-in user, or 404. */
export async function findOwned(Model, req) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Not found');
  const doc = await Model.findOne({ _id: id, user: req.user._id });
  if (!doc) throw new HttpError(404, 'Not found');
  return doc;
}

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'That already exists' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large' });
  }
  if (!config.isTest) console.error(err);
  return res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
}
