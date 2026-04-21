export interface UserReport {
  date: string;
  userid: string;
  profileid: string;
  chat_conversations: number;
  total_messages: number;
  credits_used: number;
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
