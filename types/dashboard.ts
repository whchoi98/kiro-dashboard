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
