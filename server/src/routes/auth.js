import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { Bill } from '../models/Bill.js';
import { Goal } from '../models/Goal.js';
import { schemas } from '../lib/schemas.js';
import {
  HttpError, parse, requireAuth, signToken, setAuthCookie, clearAuthCookie,
} from '../middleware/http.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { error: 'Too many attempts. Wait a few minutes and try again.' },
});

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = parse(schemas.register, req.body);
  if (await User.exists({ email })) throw new HttpError(409, 'An account with that email already exists', { email: 'Already registered' });
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const user = await User.create({ name, email, passwordHash });
  setAuthCookie(res, signToken(user.id));
  res.status(201).json({ user: user.toPublic() });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = parse(schemas.login, req.body);
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect');
  setAuthCookie(res, signToken(user.id));
  res.json({ user: user.toPublic() });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

router.post('/password', requireAuth, async (req, res) => {
  const { current, next } = parse(schemas.changePassword, req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, 'Your current password is incorrect', { current: 'Incorrect' });
  user.passwordHash = await bcrypt.hash(next, config.bcryptRounds);
  await user.save();
  res.json({ ok: true });
});

router.post('/delete-account', requireAuth, async (req, res) => {
  const { password } = parse(schemas.deleteAccount, req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(400, 'Your password is incorrect', { password: 'Incorrect' });
  await Promise.all([
    Transaction.deleteMany({ user: user._id }),
    Bill.deleteMany({ user: user._id }),
    Goal.deleteMany({ user: user._id }),
  ]);
  await user.deleteOne();
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;
