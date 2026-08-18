import type { VersionSection } from '@/lib/changelog-md';

export interface UserReport {
  date: string;
  userid: string;
  profileid: string;
  chat_conversations: number;
  total_messages: number;
  credits_used: number;
  overage_cap: number;
  overage_credits_used: number;
  client_type: 'KIRO_IDE' | 'KIRO_CLI' | 'PLUGIN';
  subscription_tier: string;
  overage_enabled: boolean;
}

export interface OverviewMetrics {
  totalUsers: number;
  totalMessages: number;
  totalConversations: number;
  totalCredits: number;
  totalOverageCredits: number;
  changeRates: Record<string, number>;
}

export interface DailyTrend {
  date: string;
  messages: number;
  conversations: number;
  credits: number;
  activeUsers: number;
}

export interface ClientDistribution {
  clientType: string;
  messageCount: number;
  creditCount: number;
  percentage: number;
}

export interface TopUser {
  userid: string;
  username: string;
  displayName: string;
  email: string;
  organization: string;
  totalMessages: number;
  totalCredits: number;
  rank: number;
}

export type EngagementTier = 'Power' | 'Active' | 'Light' | 'Idle';

export interface EngagementSegment {
  tier: EngagementTier;
  count: number;
  percentage: number;
}

export interface FunnelStep {
  label: string;
  count: number;
  percentage: number;
  conversionRate: number;
}

export interface CreditAnalysis {
  topUsers: Array<{
    userid: string;
    username: string;
    displayName: string;
    email: string;
    organization: string;
    totalCredits: number;
    overageCredits: number;
  }>;
  baseVsOverage: {
    base: number;
    overage: number;
  };
  byTier: Array<{
    tier: string;
    userCount: number;
    totalCredits: number;
  }>;
}

export interface EngagementData {
  segments: EngagementSegment[];
  funnel: FunnelStep[];
}

export interface ModelDistribution {
  model: string;
  messages: number;
  percentage: number;
}

export interface ModelTrendPoint {
  date: string;
  [model: string]: string | number;
}

export interface ModelUserPreference {
  userid: string;
  displayName: string;
  models: Record<string, number>;
  totalMessages: number;
  primaryModel: string;
}

export interface ModelUsageData {
  distribution: ModelDistribution[];
  trend: ModelTrendPoint[];
  userPreferences: ModelUserPreference[];
  availableModels: string[];
}

export interface TierSlice {
  tier: string;
  userCount: number;
  totalCredits: number;
  totalMessages: number;
  creditShare: number;
}

export interface OverageUser {
  userid: string;
  displayName: string;
  tier: string;
  overageCredits: number;
  overageCap: number;
  utilization: number;
}

export interface SubscriptionData {
  tiers: TierSlice[];
  tierTrend: Array<{ date: string; [tier: string]: string | number }>;
  overageSummary: {
    enabledUsers: number;
    totalUsers: number;
    totalOverageCredits: number;
    totalBaseCredits: number;
  };
  overageUsers: OverageUser[];
}

export interface AdoptionTrendPoint {
  date: string;
  newUsers: number;
  activeUsers: number;
  cumulativeUsers: number;
}

export interface NewUserRow {
  userid: string;
  displayName: string;
  firstDate: string;
  clientType: string;
  totalMessages: number;
  totalCredits: number;
}

export interface AdoptionData {
  trend: AdoptionTrendPoint[];
  totals: { newUsers: number; activeUsers: number };
  recentNewUsers: NewUserRow[];
}

// ── /api/rollout — client rollout (IDE vs CLI) ───────────────────────────
/** Per-day distinct actives per client, plus the cumulative ever-used curve. */
export interface RolloutTrendPoint {
  date: string;
  /** Distinct users active on this client that day. */
  daily: Record<string, number>;
  /** Distinct users who had EVER used this client by this day. */
  cumulative: Record<string, number>;
}

/**
 * Cross-client classification. `pickupLagDays` is null when the user's first
 * activity lands on the window's first date — we cannot tell a genuine
 * same-day pickup from a user who had been active before the window opened.
 */
export interface RolloutUserRow {
  userid: string;
  displayName: string;
  clients: string[];
  segment: 'ide-only' | 'cli-only' | 'both';
  firstSeen: string;
  lastSeen: string;
  firstClient: string;
  secondClient: string | null;
  pickupLagDays: number | null;
  totalMessages: number;
  totalCredits: number;
}

export interface RolloutClientSummary {
  clientType: string;
  users: number;
  activeDays: number;
  totalMessages: number;
  totalCredits: number;
  firstSeen: string;
  lastSeen: string;
}

export interface RolloutData {
  /** Client types actually present in the window — never a hardcoded list. */
  clients: string[];
  clientSummary: RolloutClientSummary[];
  trend: RolloutTrendPoint[];
  overlap: { ideOnly: number; cliOnly: number; both: number; total: number };
  users: RolloutUserRow[];
  /** Earliest date in the window's data — the "data begins" annotation. */
  dataStart: string | null;
  /** Distinct subscription tiers; a single tier means no tier comparison. */
  tiers: string[];
  /** tier → clientType → distinct users. Empty when tiers.length < 2. */
  tierByClient: Array<{ tier: string; counts: Record<string, number> }>;
}

// ── /api/ingest-health — UAR delivery monitoring ─────────────────────────
/**
 * One delivered CSV. `deliveredAt` is the S3 object write time, NOT the
 * report's 02:00 UTC target — the two differ by delivery latency.
 */
export interface IngestFile {
  key: string;
  reportDate: string;
  clientType: string;
  sizeBytes: number;
  deliveredAt: string | null;
  rowCount: number;
  headerCount: number;
}

/**
 * Per report date × client type. `delivered: false` is NOT an ingest
 * failure — Kiro only writes a file for a client somebody used that day.
 */
export interface IngestDayCell {
  date: string;
  clientType: string;
  delivered: boolean;
  files: number;
  rows: number;
  bytes: number;
}

/** A distinct header set observed across files, with when it was in use. */
export interface HeaderVariant {
  headers: string[];
  files: number;
  firstDate: string;
  lastDate: string;
}

export interface IngestHealthData {
  configured: boolean;
  freshness: {
    latestReportDate: string | null;
    /** Object write time of the newest CSV (ISO), not the 02:00 UTC target. */
    latestDeliveredAt: string | null;
    /** Whole days between the newest report date and today (UTC). */
    reportLagDays: number | null;
    totalFiles: number;
    totalRows: number;
    totalBytes: number;
  };
  clients: string[];
  dates: string[];
  matrix: IngestDayCell[];
  files: IngestFile[];
  headerVariants: HeaderVariant[];
  /** Row counts from Athena vs the CSVs — a silent-drift check. */
  parity: {
    athenaRows: number | null;
    csvRows: number;
    /** null when the Athena side is unavailable (fresh account). */
    deltaRows: number | null;
  };
  /** Which by_user_analytic metric columns actually carry values. */
  legacyInstrumentation: {
    available: boolean;
    columns: Array<{ column: string; nonZeroRows: number }>;
    totalRows: number;
  };
  config: {
    bucketConfigured: boolean;
    prefixConfigured: boolean;
    glueTable: string | null;
    athenaDatabase: string | null;
  };
}

export interface DevActivityGroup {
  key: string;
  events: number;
  generated: number;
  accepted: number;
  acceptanceRate: number;
}

export interface DevActivityData {
  groups: DevActivityGroup[];
  trend: Array<{ date: string; [group: string]: string | number }>;
  topUsers: Array<{
    userid: string;
    displayName: string;
    events: number;
    acceptedLines: number;
  }>;
}

// ── /api/idc-users — dormancy grading ────────────────────────────────────
/**
 * Dormancy buckets for DIRECTORY users. These describe IAM Identity Center
 * workforce accounts, NOT Kiro seats/licenses: the directory is not a
 * subscription roster (only `user-subscriptions:ListUserSubscriptions` is,
 * and it isn't granted to the task role), and pending subscriptions are
 * never charged. `never` therefore means "no Kiro activity in the window",
 * not "wasted license".
 */
export type DormancyBucket = 'active7' | 'dormant30' | 'dormant60' | 'dormantOld' | 'never';

export interface DormancySummary {
  bucket: DormancyBucket;
  count: number;
  percentage: number;
}

export interface IdcUsersData {
  total: number;
  active: number;
  inactive: number;
  /** Directory users badged as newly registered (see `isNewRegistrant` below). */
  newRegistrants: number;
  /** Window used for the dormancy grading, in days. */
  windowDays: number;
  dormancy: DormancySummary[];
  /** Directory → any activity → sustained activity, as counts. */
  funnel: FunnelStep[];
  users: Array<{
    userId: string;
    displayName: string;
    email: string;
    status: 'active' | 'inactive';
    totalMessages: number;
    totalCredits: number;
    lastActive: string | null;
    organization: string;
    /** Days since last activity; null for users with no activity at all. */
    daysSinceLastActive: number | null;
    activeDays: number;
    dormancy: DormancyBucket;
    /** First-seen ledger stamp (ISO), null for pre-existing/seed-batch users. */
    firstSeenAt: string | null;
    /** True only when the window covers NEW_REGISTRANT_DAYS and the ledger stamp is still within it. */
    isNewRegistrant: boolean;
  }>;
}

// ── /api/productivity — credit efficiency KPI ────────────────────────────
/**
 * Credits per accepted AI code line. Deliberately computed as two
 * INDEPENDENT sums over the same date window rather than a user+date join:
 * the two reports use different date formats and 303 of by_user_analytic's
 * 541 (user, date) pairs have no user_report counterpart, so an inner join
 * would silently drop over half the legacy data.
 *
 * `creditsPerLine` is a credit ratio, never a currency amount — Kiro
 * publishes no credit→price rate, so this must not be rendered with a
 * currency symbol.
 */
export interface CreditEfficiency {
  /** True only when both sides have data in the overlapping window. */
  available: boolean;
  credits: number;
  /** chat_aicodelines + inline_aicodelines. */
  acceptedLines: number;
  creditsPerLine: number | null;
  /** Inclusive window both sums were taken over. */
  windowStart: string | null;
  windowEnd: string | null;
  /** Distinct users on each side — they are NOT the same population. */
  creditUsers: number;
  lineUsers: number;
}

/**
 * `/api/release-notes` response — the notes for the running build, shown by
 * the sidebar version badge. `section` reuses `VersionSection` from
 * `lib/changelog-md.ts` (the same shape /changelog renders) so the dialog and
 * the full page cannot drift apart.
 */
export interface ReleaseNotesResponse {
  /** APP_VERSION of the running build. */
  version: string;
  /**
   * False when `section` is a fallback — the changelog has no entry for
   * `version` yet, so the newest release is shown instead. The dialog must
   * label that rather than implying the notes describe the running build.
   */
  exact: boolean;
  section: VersionSection | null;
  /** Recent releases (newest first, `[Unreleased]` excluded) for quick links. */
  history: Array<{ version: string; date: string | null }>;
}

/** One model's share of a single user's messages. */
export interface UserModelSlice {
  model: string;
  messages: number;
  /** 0 when the user has model columns but no messages — never NaN. */
  percentage: number;
}

/**
 * `/api/user-model-usage` response — per-user model breakdown shown in the
 * user detail panel. Read S3-direct because `{model}_messages` columns are
 * dynamic (ADR-0004), so this cannot come from `/api/user-detail`'s Athena
 * queries.
 */
export interface UserModelUsageData {
  userid: string;
  /** Descending by messages. */
  models: UserModelSlice[];
  /** Per-day counts keyed by model name, oldest first. */
  trend: Array<{ date: string } & Record<string, string | number>>;
  /** Messages per client type, derived from the CSV file names. */
  clients: Array<{ clientType: string; messages: number }>;
  totalMessages: number;
  distinctModels: number;
  primaryModel: string | null;
  /**
   * False when the UAR bucket/prefix env is unset. Distinguishes "not wired up"
   * from "no model usage" — both would otherwise render as zero.
   */
  configured: boolean;
  /**
   * Report days that actually carried model columns. `0` with `configured:
   * true` means the reports never reported models for this window, which is
   * not the same as the user using none.
   */
  daysWithModelColumns: number;
}
