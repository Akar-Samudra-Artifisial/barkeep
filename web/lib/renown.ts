// TypeScript port of gno.land/p/<ns>/renown/v0 for the calculator and the
// fixture generator. Integers only, same rounding as the Gno package:
// points in milli-points, multipliers in permille.

export const MILLI = 1000;
export const PERMILLE = 1000;

export interface RenownParams {
  halfLife: number;
  maturityPeriod: number;
  maturityStart: number;
  identityBonus: number;
  diversityStep: number;
  diversityMax: number;
  defaultWeight: number;
  maxWeight: number;
  defaultCap: number;
  maxUnitsPerAttest: number;
}

export const DEFAULT_PARAMS: RenownParams = {
  halfLife: 30 * 24 * 3600,
  maturityPeriod: 7 * 24 * 3600,
  maturityStart: 500,
  identityBonus: 1200,
  diversityStep: 150,
  diversityMax: 1600,
  defaultWeight: 1000,
  maxWeight: 3000,
  defaultCap: 100 * MILLI,
  maxUnitsPerAttest: 100,
};

export const TIER_MIN = { Regular: 10, Patron: 100, Legend: 500 } as const;

const DECAY_STEPS = [1_000_000, 917_004, 840_896, 771_105, 707_107, 648_420, 594_604, 545_254];
const SCALE = 1_000_000;

/** floor(x * num / den) for non-negative integers, exact through BigInt. */
export function mulDiv(x: number, num: number, den: number): number {
  if (den === 0) return 0;
  return Number((BigInt(Math.trunc(x)) * BigInt(Math.trunc(num))) / BigInt(Math.trunc(den)));
}

export function decay(points: number, dt: number, halfLife: number): number {
  if (points <= 0) return 0;
  if (dt <= 0 || halfLife <= 0) return points;
  const halves = Math.floor(dt / halfLife);
  if (halves >= 63) return 0;
  const p = Number(BigInt(points) >> BigInt(halves));
  const k = mulDiv(dt % halfLife, 8, halfLife);
  return mulDiv(p, DECAY_STEPS[k], SCALE);
}

export function accrue(
  bucket: { points: number; lastTs: number },
  add: number,
  now: number,
  halfLife: number,
  capacity: number,
): { points: number; lastTs: number } {
  let v = decay(bucket.points, now - bucket.lastTs, halfLife);
  if (add > 0) v += add;
  return { points: Math.min(v, capacity), lastTs: now };
}

export function weighted(value: number, weight: number): number {
  return mulDiv(value, weight, PERMILLE);
}

export function maturity(firstSeen: number, now: number, p: RenownParams): number {
  if (firstSeen <= 0 || now < firstSeen) return p.maturityStart;
  const elapsed = now - firstSeen;
  if (p.maturityPeriod <= 0 || elapsed >= p.maturityPeriod) return PERMILLE;
  return p.maturityStart + mulDiv(PERMILLE - p.maturityStart, elapsed, p.maturityPeriod);
}

export function diversity(activeCategories: number, p: RenownParams): number {
  if (activeCategories <= 1) return PERMILLE;
  return Math.min(PERMILLE + p.diversityStep * (activeCategories - 1), p.diversityMax);
}

export function identity(named: boolean, p: RenownParams): number {
  return named ? p.identityBonus : PERMILLE;
}

export function composite(base: number, ident: number, mat: number, div: number): number {
  let s = mulDiv(base, mat, PERMILLE);
  s = mulDiv(s, div, PERMILLE);
  return mulDiv(s, ident, PERMILLE);
}

export function toPoints(milli: number): number {
  return milli <= 0 ? 0 : Math.floor(milli / MILLI);
}

export function tierOf(score: number): "Stranger" | "Regular" | "Patron" | "Legend" {
  if (score >= TIER_MIN.Legend) return "Legend";
  if (score >= TIER_MIN.Patron) return "Patron";
  if (score >= TIER_MIN.Regular) return "Regular";
  return "Stranger";
}

/** milliStr from the realm: milli-points as a 3-decimal number. */
export function milliToNumber(v: number): number {
  return Math.trunc(v) / 1000;
}

export interface CalcInput {
  /** weighted points per category, in whole points */
  categories: number[];
  daysSinceFirstSeen: number;
  named: boolean;
}

export interface CalcResult {
  base: number;
  active: number;
  maturity: number;
  diversity: number;
  identity: number;
  total: number;
  score: number;
  tier: ReturnType<typeof tierOf>;
}

export function calculate(input: CalcInput, p: RenownParams = DEFAULT_PARAMS): CalcResult {
  const cats = input.categories.map((c) => Math.max(0, Math.round(c * MILLI)));
  const base = cats.reduce((a, b) => a + b, 0);
  const active = cats.filter((c) => c >= MILLI).length;
  const now = 10_000_000_000;
  const hasHistory = base > 0;
  const first = hasHistory ? now - Math.max(0, Math.round(input.daysSinceFirstSeen * 86400)) : 0;
  const mat = maturity(first, now, p);
  const div = diversity(active, p);
  const ident = identity(input.named, p);
  const total = composite(base, ident, mat, div);
  const score = toPoints(total);
  return { base, active, maturity: mat, diversity: div, identity: ident, total, score, tier: tierOf(score) };
}
