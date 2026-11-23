// Shapes returned by gno.land/r/<ns>/barkeep json.gno, field for field.
// Decimal point values (milliStr) arrive as JSON numbers with 3 fraction digits.

export type Category = "governance" | "contribution" | "defi" | "building" | "community";
export const CATEGORIES: Category[] = ["governance", "contribution", "defi", "building", "community"];

export type Tier = "Stranger" | "Regular" | "Patron" | "Legend";
export const TIERS: Tier[] = ["Stranger", "Regular", "Patron", "Legend"];

export type SourceTier = "unverified" | "verified" | "revoked";

export interface ProfileBucket {
  source: string;
  category: Category;
  tier: SourceTier;
  points: number;
  weighted: number;
  lastTs: number;
}

export interface RecentEntry {
  source: string;
  kind: string;
  units: number;
  ts: number;
}

export interface Profile {
  address: string;
  score: number;
  tier: Tier;
  total: number;
  base: number;
  multipliers: { identity: number; maturity: number; diversity: number };
  named: boolean;
  activeCategories: number;
  categories: Record<Category, number>;
  firstSeen: number;
  attestations: number;
  buckets: ProfileBucket[];
  recent: RecentEntry[];
  now: number;
}

export interface LeaderboardItem {
  rank: number;
  address: string;
  score: number;
  tier: Tier;
}

export interface Leaderboard {
  total: number;
  offset: number;
  profiles: number;
  attestations: number;
  items: LeaderboardItem[];
  now: number;
}

export interface Source {
  id: number;
  path: string;
  category: Category;
  desc: string;
  tier: SourceTier;
  weight: number;
  effectiveWeight: number;
  capPoints: number;
  paused: boolean;
  registeredAt: number;
  attestations: number;
}

export interface SourcesPage {
  total: number;
  offset: number;
  items: Source[];
}

export interface Params {
  halfLifeSeconds: number;
  maturityPeriodSeconds: number;
  maturityStart: number;
  identityBonus: number;
  diversityStep: number;
  diversityMax: number;
  defaultWeight: number;
  maxWeight: number;
  defaultCapPoints: number;
  maxUnitsPerAttest: number;
  maxBuckets: number;
  maxRecent: number;
  maxTop: number;
  tiers: { Regular: number; Patron: number; Legend: number };
  paused: boolean;
  admin: string;
}

export interface Poll {
  id: number;
  question: string;
  votes: number;
}

export interface PollDetail {
  id: number;
  question: string;
  author: string;
  height: number;
  options: { index: number; label: string; votes: number }[];
}

export interface LoungeEntry {
  height: number;
  patron: string;
  tier: string;
  message: string;
}

/** Why a read failed, in terms the UI can explain. */
export type ReadErrorKind = "not-deployed" | "network" | "chain" | "parse";

export type Read<T> =
  | { ok: true; data: T; fetchedAt: number }
  | { ok: false; kind: ReadErrorKind; message: string; fetchedAt: number };
