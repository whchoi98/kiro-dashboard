import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// Days a first-seen directory user counts as "신규 등록" while still inactive.
export const NEW_REGISTRANT_DAYS = 7;

export interface FirstSeenLedger {
  version: 1;
  seededAt: string;
  // null = seed batch (pre-existing user, never badged as new).
  users: Record<string, string | null>;
}

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

// The ledger lives under the Athena-results prefix because that is the only
// S3 location the task role can PUT to — no new IAM for this feature.
function ledgerLocation(): { bucket: string; key: string } | null {
  const raw = process.env.ATHENA_OUTPUT_BUCKET || '';
  if (!raw) return null;
  const [bucket, ...rest] = raw.replace('s3://', '').split('/');
  if (!bucket) return null;
  const prefix = rest.filter(Boolean).join('/');
  return { bucket, key: prefix ? `${prefix}/idc-first-seen.json` : 'idc-first-seen.json' };
}

export function applyLedger(
  ledger: FirstSeenLedger | null,
  currentIds: string[],
  nowIso: string,
): { ledger: FirstSeenLedger; changed: boolean } {
  if (ledger === null) {
    // First ever run: seed everyone as pre-existing so nobody is falsely
    // badged when the feature first deploys.
    const users: Record<string, string | null> = {};
    for (const id of currentIds) users[id] = null;
    return { ledger: { version: 1, seededAt: nowIso, users }, changed: true };
  }
  let changed = false;
  const users = { ...ledger.users };
  for (const id of currentIds) {
    if (!(id in users)) {
      users[id] = nowIso;
      changed = true;
    }
  }
  return { ledger: changed ? { ...ledger, users } : ledger, changed };
}

export function withinNewRegistrantWindow(
  firstSeen: string | null | undefined,
  nowMs: number,
): boolean {
  if (!firstSeen) return false;
  const seenMs = Date.parse(firstSeen);
  if (Number.isNaN(seenMs)) return false;
  // A stamp slightly in the future (clock skew) is still "new".
  return nowMs - seenMs <= NEW_REGISTRANT_DAYS * 86_400_000;
}

export async function loadLedger(): Promise<FirstSeenLedger | null> {
  const loc = ledgerLocation();
  if (!loc) return null;
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: loc.bucket, Key: loc.key }));
    const body = (await resp.Body?.transformToString()) ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      // Corrupt/truncated body → treat as absent; caller re-seeds (self-heal).
      return null;
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1 ||
      typeof (parsed as { users?: unknown }).users !== 'object' ||
      (parsed as { users?: unknown }).users === null ||
      Array.isArray((parsed as { users?: unknown }).users)
    ) {
      // Unrecognized shape → treat as absent; the caller re-seeds (all null),
      // which self-heals a corrupt ledger at the cost of its history.
      return null;
    }
    return parsed as FirstSeenLedger;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === 'NoSuchKey' || status === 404) return null;
    throw err;
  }
}

export async function saveLedger(ledger: FirstSeenLedger): Promise<void> {
  const loc = ledgerLocation();
  if (!loc) return;
  await s3.send(new PutObjectCommand({
    Bucket: loc.bucket,
    Key: loc.key,
    Body: JSON.stringify(ledger),
    ContentType: 'application/json',
  }));
}
