import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeInt } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { EngagementData, EngagementSegment, EngagementTier, FunnelStep } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') ?? '30', 10);

    const tableName = await resolveTableName();

    const sql = `
      SELECT
        userid,
        SUM(CAST(total_messages AS INTEGER)) AS total_messages,
        SUM(CAST(chat_conversations AS INTEGER)) AS total_conversations
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY userid
    `;

    const rows = await executeQuery(sql);

    let power = 0;
    let active = 0;
    let light = 0;
    let idle = 0;

    let messageSenders = 0;
    let conversationalists = 0;
    let activePlus = 0;
    let powerPlus = 0;

    const totalUsers = rows.length;

    for (const row of rows) {
      const msgs = safeInt(row.total_messages);
      const convs = safeInt(row.total_conversations);

      if (msgs > 0) messageSenders++;
      if (convs > 0) conversationalists++;
      if (msgs >= 20 || convs >= 5) activePlus++;
      if (msgs >= 100 || convs >= 20) powerPlus++;

      // Tier classification
      let tier: EngagementTier;
      if (msgs >= 100 || convs >= 20) {
        tier = 'Power';
      } else if (msgs >= 20 || convs >= 5) {
        tier = 'Active';
      } else if (msgs >= 1) {
        tier = 'Light';
      } else {
        tier = 'Idle';
      }

      if (tier === 'Power') power++;
      else if (tier === 'Active') active++;
      else if (tier === 'Light') light++;
      else idle++;
    }

    const segments: EngagementSegment[] = [
      { tier: 'Power', count: power, percentage: totalUsers > 0 ? (power / totalUsers) * 100 : 0 },
      { tier: 'Active', count: active, percentage: totalUsers > 0 ? (active / totalUsers) * 100 : 0 },
      { tier: 'Light', count: light, percentage: totalUsers > 0 ? (light / totalUsers) * 100 : 0 },
      { tier: 'Idle', count: idle, percentage: totalUsers > 0 ? (idle / totalUsers) * 100 : 0 },
    ];

    const funnelRaw = [
      { label: 'All Users', count: totalUsers },
      { label: 'Message Senders', count: messageSenders },
      { label: 'Conversationalists', count: conversationalists },
      { label: 'Active (20+ msgs)', count: activePlus },
      { label: 'Power (100+ msgs)', count: powerPlus },
    ];

    const funnel: FunnelStep[] = funnelRaw.map((step, index) => ({
      label: step.label,
      count: step.count,
      percentage: totalUsers > 0 ? (step.count / totalUsers) * 100 : 0,
      conversionRate:
        index === 0
          ? 100
          : funnelRaw[index - 1].count > 0
          ? (step.count / funnelRaw[index - 1].count) * 100
          : 0,
    }));

    const result: EngagementData = { segments, funnel };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/engagement] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch engagement data' }, { status: 500 });
  }
}
