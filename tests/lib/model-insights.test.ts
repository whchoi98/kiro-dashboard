/**
 * Pure model-usage views behind /api/model-usage and /api/ingest-health. The
 * model list is dynamic (16 models seen in Aug–Oct 2026, 5 third-party
 * families), so these tests pin behaviour on names the code has never seen.
 */

import {
  modelVendor,
  vendorShares,
  modelDistribution,
  clientModelMix,
  modelAdoption,
  modelSumParity,
  type ReportFile,
} from '../../lib/model-insights';
import type { CsvRow } from '../../lib/uar-s3';

const row = (r: Record<string, string>) => r as CsvRow;

describe('modelVendor', () => {
  it.each([
    ['claude_opus_5.5_messages', 'anthropic'],
    ['claude_haiku_4.5_messages', 'anthropic'],
    ['auto_messages', 'auto'],
    ['gpt_5.6_sol_messages', 'third_party'],
    ['qwen3_coder_next_messages', 'third_party'],
    ['glm_5_messages', 'third_party'],
    ['deepseek_3.2_messages', 'third_party'],
    ['minimax_m2.1_messages', 'third_party'],
    // A family nobody has shipped yet still lands somewhere sensible.
    ['brand_new_model_messages', 'third_party'],
  ])('%s → %s', (column, vendor) => {
    expect(modelVendor(column)).toBe(vendor);
  });
});

describe('vendorShares', () => {
  it('lists every vendor in a fixed order, including a 0% one', () => {
    const shares = vendorShares(new Map([['claude_opus_5_messages', 90], ['auto_messages', 10]]));
    expect(shares.map((s) => s.vendor)).toEqual(['anthropic', 'third_party', 'auto']);
    expect(shares.find((s) => s.vendor === 'third_party')).toEqual({
      vendor: 'third_party',
      messages: 0,
      percentage: 0,
    });
    expect(shares.reduce((s, v) => s + v.percentage, 0)).toBeCloseTo(100);
  });

  it('is empty when there are no messages at all', () => {
    expect(vendorShares(new Map())).toEqual([]);
  });
});

describe('modelDistribution', () => {
  it('tags each model with its vendor and sorts largest first', () => {
    const dist = modelDistribution(new Map([['gpt_5.6_sol_messages', 2], ['claude_opus_5_messages', 8]]));
    expect(dist).toEqual([
      { model: 'Claude Opus 5', messages: 8, percentage: 80, vendor: 'anthropic' },
      { model: 'Gpt 5.6 Sol', messages: 2, percentage: 20, vendor: 'third_party' },
    ]);
  });
});

describe('clientModelMix', () => {
  const files: ReportFile[] = [
    {
      clientType: 'KIRO_CLI',
      rows: [row({ date: '2026-10-27', userid: 'u1', total_messages: '10', claude_opus_5_messages: '8', 'gpt_5.6_sol_messages': '2' })],
    },
    {
      clientType: 'KIRO_IDE',
      rows: [row({ date: '2026-10-27', userid: 'u2', total_messages: '6', auto_messages: '1', claude_opus_5_messages: '5' })],
    },
    { clientType: 'PLUGIN', rows: [row({ date: '2026-10-27', userid: 'u3', total_messages: '0', claude_opus_5_messages: '0' })] },
    { clientType: '', rows: [row({ date: '2026-10-27', userid: 'u4', total_messages: '3', claude_opus_5_messages: '3' })] },
  ];

  it('groups by client, never counting total_messages as a model', () => {
    const mix = clientModelMix(files);
    const cli = mix.find((m) => m.clientType === 'KIRO_CLI')!;
    expect(cli.totalMessages).toBe(10);
    expect(cli.models.map((m) => m.model)).toEqual(['Claude Opus 5', 'Gpt 5.6 Sol']);
    expect(cli.models.some((m) => /total/i.test(m.model))).toBe(false);
    expect(cli.vendors.find((v) => v.vendor === 'third_party')?.percentage).toBeCloseTo(20);
  });

  it('omits a client with no model messages and labels a nameless file UNKNOWN', () => {
    expect(clientModelMix(files).map((m) => m.clientType)).toEqual(['KIRO_CLI', 'KIRO_IDE', 'UNKNOWN']);
  });
});

describe('modelAdoption', () => {
  const files: ReportFile[] = [
    {
      clientType: 'KIRO_CLI',
      rows: [
        row({ date: '2026-10-01', userid: 'd-abc123.u1', claude_opus_5_messages: '10', claude_old_messages: '5' }),
        row({ date: '2026-10-20', userid: 'u1', claude_opus_5_messages: '6', 'claude_opus_5.5_messages': '4' }),
        row({ date: '2026-10-18', userid: 'u2', claude_opus_5_messages: '0', 'claude_opus_5.5_messages': '6' }),
        row({ date: 'not-a-date', userid: 'u9', claude_opus_5_messages: '999' }),
      ],
    },
  ];
  const adoption = modelAdoption(files);
  const byName = (name: string) => adoption.find((a) => a.model === name)!;

  it('records first/last seen and distinct users (normalized ids, zero cells ignored)', () => {
    expect(byName('Claude Opus 5')).toMatchObject({
      firstSeen: '2026-10-01',
      lastSeen: '2026-10-20',
      users: 1, // d-abc123.u1 and u1 are the same user; u2's 0 does not count
      messages: 16,
    });
    expect(byName('Claude Opus 5.5')).toMatchObject({ firstSeen: '2026-10-18', users: 2, messages: 10 });
  });

  it('skips rows whose date is malformed', () => {
    expect(byName('Claude Opus 5').messages).toBe(16);
  });

  it('flags models first seen on the window start as possibly older', () => {
    expect(byName('Claude Opus 5').firstSeenAtWindowStart).toBe(true);
    expect(byName('Claude Opus 5.5').firstSeenAtWindowStart).toBe(false);
  });

  it('computes the recent share over the last 7 calendar days ending at the newest date', () => {
    // Window ends 2026-10-20 → recent = 10-14..10-20: opus 5 = 6, opus 5.5 = 10.
    expect(byName('Claude Opus 5.5').recentShare).toBeCloseTo(62.5);
    expect(byName('Claude Opus 5').recentShare).toBeCloseTo(37.5);
    expect(byName('Claude Old').recentShare).toBe(0);
  });

  it('lists the newest model first', () => {
    expect(adoption[0].model).toBe('Claude Opus 5.5');
  });

  it('is empty without data', () => {
    expect(modelAdoption([])).toEqual([]);
  });
});

describe('modelSumParity', () => {
  it('passes rows whose model columns sum to total_messages', () => {
    const result = modelSumParity([
      row({ date: 'd', userid: 'u', total_messages: '10', claude_opus_5_messages: '8', auto_messages: '2' }),
    ]);
    expect(result).toEqual({ applicable: true, rows: 1, mismatches: [] });
  });

  it('reports a row whose model columns fall short', () => {
    const result = modelSumParity([
      row({ date: 'd', userid: 'u', total_messages: '10', claude_opus_5_messages: '7' }),
    ]);
    expect(result.mismatches).toEqual([{ totalMessages: 10, modelSum: 7 }]);
  });

  it('counts a non-numeric cell as a mismatch, not as 0', () => {
    const result = modelSumParity([
      row({ date: 'd', userid: 'u', total_messages: '0', claude_opus_5_messages: 'n/a' }),
    ]);
    expect(result.mismatches).toHaveLength(1);
  });

  it('skips files that predate model columns instead of passing them', () => {
    expect(modelSumParity([row({ date: 'd', userid: 'u', total_messages: '10' })]).applicable).toBe(false);
    expect(modelSumParity([]).applicable).toBe(false);
  });
});
