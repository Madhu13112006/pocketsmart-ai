// Single source of truth for categories. The client reads these from GET /api/meta.
export const CATEGORIES = [
  { name: 'Rent & Housing', kind: 'need', cap: 14000 },
  { name: 'Groceries', kind: 'need', cap: 6000 },
  { name: 'Utilities & Bills', kind: 'need', cap: 2200 },
  { name: 'Transport & Fuel', kind: 'need', cap: 2500 },
  { name: 'Health & Medicine', kind: 'need', cap: 1500 },
  { name: 'Education', kind: 'need', cap: 1500 },
  { name: 'Dining Out', kind: 'want', cap: 3000 },
  { name: 'Shopping', kind: 'want', cap: 4000 },
  { name: 'Entertainment', kind: 'want', cap: 1200 },
  { name: 'Travel', kind: 'want', cap: 2000 },
  { name: 'Subscriptions', kind: 'want', cap: 1000 },
  { name: 'Other', kind: 'want', cap: 1000 },
  { name: 'Savings & Investments', kind: 'save', cap: 9600 },
];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);
export const KIND_OF = Object.fromEntries(CATEGORIES.map((c) => [c.name, c.kind]));
export const DEFAULT_CAPS = Object.fromEntries(CATEGORIES.map((c) => [c.name, c.cap]));

export const CURRENCIES = {
  inr: { symbol: '₹', locale: 'en-IN', label: 'Indian rupee' },
  usd: { symbol: '$', locale: 'en-US', label: 'US dollar' },
  eur: { symbol: '€', locale: 'de-DE', label: 'Euro' },
  gbp: { symbol: '£', locale: 'en-GB', label: 'Pound sterling' },
};
