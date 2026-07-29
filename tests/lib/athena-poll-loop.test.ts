/**
 * The poll LOOP, not just the schedule. Pins the two properties the ramp had to
 * preserve, both of which a source read is easy to get wrong about:
 *
 *   - The FIRST `GetQueryExecution` fires at t+0. This was already true before
 *     the ramp (check first, sleep last), and a refactor that hoisted the sleep
 *     would be invisible in `pollDelayMs` tests while adding 150ms to every
 *     single query — including the ones that were already SUCCEEDED.
 *   - FAILED / CANCELLED still throw immediately, with the StateChangeReason,
 *     and without sleeping first.
 *
 * Uses `executeQueryUncached` so the result memo is out of the picture.
 */

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-athena', () => ({
  AthenaClient: jest.fn(() => ({ send: sendMock })),
  StartQueryExecutionCommand: jest.fn((input) => ({ __type: 'Start', input })),
  GetQueryExecutionCommand: jest.fn((input) => ({ __type: 'GetExecution', input })),
  GetQueryResultsCommand: jest.fn((input) => ({ __type: 'GetResults', input })),
  QueryExecutionState: {
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
  },
}));

import { executeQueryUncached, pollDelayMs } from '../../lib/athena';

/** Records the wall-clock offset of every GetQueryExecution call. */
function scriptStates(states: string[], reason?: string) {
  const start = Date.now();
  const statusOffsets: number[] = [];
  let statusCall = 0;

  sendMock.mockImplementation(async (cmd: { __type: string }) => {
    if (cmd.__type === 'Start') return { QueryExecutionId: 'q-1' };
    if (cmd.__type === 'GetExecution') {
      statusOffsets.push(Date.now() - start);
      const state = states[Math.min(statusCall++, states.length - 1)];
      return {
        QueryExecution: {
          Status: { State: state, ...(reason ? { StateChangeReason: reason } : {}) },
        },
      };
    }
    return {
      ResultSet: {
        ResultSetMetadata: { ColumnInfo: [{ Name: 'n' }] },
        Rows: [{ Data: [{ VarCharValue: 'n' }] }, { Data: [{ VarCharValue: '7' }] }],
      },
    };
  });

  return statusOffsets;
}

beforeEach(() => {
  sendMock.mockReset();
  process.env.ATHENA_DATABASE = 'titanlog';
  process.env.ATHENA_OUTPUT_BUCKET = 's3://bucket/results/';
});

describe('executeQueryUncached poll loop', () => {
  it('checks status immediately — an already-SUCCEEDED query sleeps zero ms', async () => {
    const offsets = scriptStates(['SUCCEEDED']);
    const t0 = Date.now();
    const rows = await executeQueryUncached('SELECT 1');
    const elapsed = Date.now() - t0;

    expect(offsets).toHaveLength(1);
    // Well under the smallest ramp step, so this fails if a sleep is ever
    // hoisted above the status check.
    expect(offsets[0]).toBeLessThan(pollDelayMs(0));
    expect(elapsed).toBeLessThan(pollDelayMs(0));
    expect(rows).toEqual([{ n: '7' }]);
  });

  it('sleeps only between checks, following the ramp schedule', async () => {
    const offsets = scriptStates(['RUNNING', 'RUNNING', 'RUNNING', 'SUCCEEDED']);
    await executeQueryUncached('SELECT 1');

    expect(offsets).toHaveLength(4);
    // Gap i is the sleep taken after check i, i.e. pollDelayMs(i). Timer
    // scheduling only ever runs late, so assert a lower bound with a small
    // tolerance rather than an exact equality.
    for (let i = 1; i < offsets.length; i++) {
      const gap = offsets[i] - offsets[i - 1];
      expect(gap).toBeGreaterThanOrEqual(pollDelayMs(i - 1) - 25);
    }
    // Cumulative wait is strictly better than the old fixed 500ms per gap.
    expect(offsets[offsets.length - 1]).toBeLessThan(3 * 500);
  });

  it.each(['FAILED', 'CANCELLED'])(
    'throws on %s with the StateChangeReason, without sleeping',
    async (state) => {
      const offsets = scriptStates([state], 'boom');
      const t0 = Date.now();
      await expect(executeQueryUncached('SELECT 1')).rejects.toThrow(
        `Query ${state}: boom`
      );
      expect(Date.now() - t0).toBeLessThan(pollDelayMs(0));
      expect(offsets).toHaveLength(1);
      // No GetQueryResults after a terminal failure.
      const kinds = sendMock.mock.calls.map((c) => c[0].__type);
      expect(kinds).not.toContain('GetResults');
    }
  );

  it('reports "Unknown reason" when Athena omits StateChangeReason', async () => {
    scriptStates(['FAILED']);
    await expect(executeQueryUncached('SELECT 1')).rejects.toThrow(
      'Query FAILED: Unknown reason'
    );
  });

  it('does not pass MaxResults to GetQueryResults', async () => {
    // Omitting MaxResults already yields the largest page (up to the 1000-row
    // service maximum) and therefore the FEWEST round trips; setting it could
    // only add pagination calls. Nothing here paginates at ~323-row scale.
    scriptStates(['SUCCEEDED']);
    await executeQueryUncached('SELECT 1');
    const results = sendMock.mock.calls
      .map((c) => c[0])
      .filter((c) => c.__type === 'GetResults');
    expect(results).toHaveLength(1);
    expect(results[0].input).not.toHaveProperty('MaxResults');
  });
});
