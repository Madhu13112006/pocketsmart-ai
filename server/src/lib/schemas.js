import { z } from 'zod';
import { CATEGORY_NAMES } from './categories.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'That is not a real calendar date');

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM');
const money = z.number().finite().positive().max(1e9);
const category = z.enum(CATEGORY_NAMES);

export const schemas = {
  register: z.object({
    name: z.string().trim().min(1, 'Enter your name').max(60),
    email: z.email('Enter a valid email address').max(254).transform((s) => s.trim().toLowerCase()),
    password: z.string().min(8, 'Use at least 8 characters').max(128),
  }),
  login: z.object({
    email: z.email('Enter a valid email address').transform((s) => s.trim().toLowerCase()),
    password: z.string().min(1, 'Enter your password').max(128),
  }),
  changePassword: z.object({
    current: z.string().min(1).max(128),
    next: z.string().min(8, 'Use at least 8 characters').max(128),
  }),
  deleteAccount: z.object({ password: z.string().min(1).max(128) }),

  settings: z.object({
    name: z.string().trim().min(1).max(60).optional(),
    currency: z.enum(['inr', 'usd', 'eur', 'gbp']).optional(),
    income: z.number().finite().min(0).max(1e9).optional(),
    payday: z.number().int().min(1).max(31).optional(),
    caps: z.partialRecord(category, z.number().finite().min(0).max(1e9)).optional(),
  }),

  transaction: z.object({
    date: isoDate,
    cat: category,
    amount: money,
    note: z.string().trim().max(80).optional().default(''),
  }),
  transactionQuery: z.object({
    month: month.optional(),
    cat: category.optional(),
    kind: z.enum(['need', 'want', 'save']).optional(),
  }),

  bill: z.object({
    name: z.string().trim().min(1, 'Name the bill').max(60),
    amount: money,
    day: z.number().int().min(1).max(31),
  }),

  goal: z.object({
    name: z.string().trim().min(1, 'Name the goal').max(60),
    target: money,
    saved: z.number().finite().min(0).max(1e9).optional().default(0),
    by: isoDate,
  }),
  goalUpdate: z.object({
    name: z.string().trim().min(1).max(60).optional(),
    target: money.optional(),
    saved: z.number().finite().min(0).max(1e9).optional(),
    by: isoDate.optional(),
  }),
  contribution: z.object({ amount: money, date: isoDate }),

  dashboardQuery: z.object({ month, today: isoDate }),
  seed: z.object({ today: isoDate }),
  afford: z.object({
    item: z.string().trim().min(1, 'Say what you are buying').max(60),
    amount: money,
    cat: category,
    when: z.enum(['now', 'month', 'later']).default('month'),
    today: isoDate,
  }),
  plan: z.object({
    kind: z.enum(['home', 'party', 'jewellery', 'travel', 'student']),
    budget: z.number().finite().min(500).max(1e9),
    style: z.enum(['balanced', 'value', 'premium']).default('balanced'),
  }),
};
