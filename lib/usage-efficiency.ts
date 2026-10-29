/**
 * Usage intensity and credit efficiency per client type, for /api/engagement.
 *
 * Pure so Jest can reach it (a route.ts may export only handlers). The one
 * definition that shapes every number here: `Total_Messages` counts prompts,
 * tool calls AND responses (official report docs), so messages per
 * conversation measures how agentic a conversation is, not how many questions
 * a user asked.
 */

import type { ClientEfficiency } from '@/types/dashboard';

export interface ClientUsageTotals {
  clientType: string;
  users: number;
  messages: number;
  conversations: number;
  credits: number;
}

/** null rather than 0 when nothing was measured — a 0 would assert a measurement. */
export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function toEfficiency(t: ClientUsageTotals): ClientEfficiency {
  return {
    ...t,
    messagesPerConversation: rate(t.messages, t.conversations),
    creditsPerMessage: rate(t.credits, t.messages),
    creditsPerConversation: rate(t.credits, t.conversations),
  };
}

/**
 * `distinctUsers` is the org-wide distinct user count. It is passed in rather
 * than summed from the rows because a user active on both IDE and CLI appears
 * in both client rows — summing would count them twice.
 */
export function buildEfficiency(
  byClient: ClientUsageTotals[],
  distinctUsers: number,
): { overall: ClientEfficiency | null; byClient: ClientEfficiency[] } {
  const rows = byClient.filter((r) => r.messages > 0 || r.conversations > 0 || r.credits > 0);
  if (rows.length === 0) return { overall: null, byClient: [] };
  const overall = toEfficiency({
    clientType: 'ALL',
    users: distinctUsers,
    messages: rows.reduce((s, r) => s + r.messages, 0),
    conversations: rows.reduce((s, r) => s + r.conversations, 0),
    credits: rows.reduce((s, r) => s + r.credits, 0),
  });
  return {
    overall,
    byClient: rows
      .map(toEfficiency)
      .sort((a, b) => a.clientType.localeCompare(b.clientType)),
  };
}
