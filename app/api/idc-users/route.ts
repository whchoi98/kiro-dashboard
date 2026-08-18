import { NextRequest, NextResponse } from 'next/server';
import { getIdcUsersPayload } from '@/lib/idc-users';

// Thin wrapper: the whole assembly lives in lib/idc-users.ts so the analyze
// chatbot's list_idc_users tool shares one implementation with this route.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));
    return NextResponse.json(await getIdcUsersPayload(days));
  } catch (err) {
    console.error('[/api/idc-users] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch IdC users' }, { status: 500 });
  }
}
