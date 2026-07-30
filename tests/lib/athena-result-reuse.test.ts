/**
 * `ResultReuseConfiguration` on StartQueryExecution.
 *
 * Reuse is shared across every Fargate task, which is the one thing the
 * per-task result memo structurally cannot do: a cold task (fresh deploy,
 * scale-out) still pays full Athena latency on its first click, and measured
 * cold that is 1.6-3.5s per route. `SELECT 1` against this account takes 2.6s
 * with zero bytes scanned, so the cost is fixed engine overhead — not something
 * query tuning can reach.
 *
 * These tests read the SDK input the client is actually handed, because the
 * whole feature is one command field: a typo in the nested shape would leave
 * every query running exactly as before with nothing to show it.
 */

const sendMock = jest.fn();
const startCommandInputs: unknown[] = [];

jest.mock('@aws-sdk/client-athena', () => ({
  AthenaClient: jest.fn(() => ({ send: sendMock })),
  StartQueryExecutionCommand: jest.fn((input) => {
    startCommandInputs.push(input);
    return { __type: 'Start', input };
  }),
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

/** Minimal happy path: start -> SUCCEEDED -> one row. */
function scriptSuccess() {
  sendMock.mockImplementation(async (cmd: { __type: string }) => {
    if (cmd.__type === 'Start') return { QueryExecutionId: 'q-1' };
    if (cmd.__type === 'GetExecution') {
      return { QueryExecution: { Status: { State: 'SUCCEEDED' } } };
    }
    return {
      ResultSet: {
        ResultSetMetadata: { ColumnInfo: [{ Name: 'n' }] },
        Rows: [{ Data: [{ VarCharValue: 'n' }] }, { Data: [{ VarCharValue: '7' }] }],
      },
    };
  });
}

/** Fresh module registry per test so the env var is read at import time. */
function loadAthena(env: Record<string, string | undefined>) {
  jest.resetModules();
  startCommandInputs.length = 0;
  sendMock.mockReset();
  scriptSuccess();
  const prev = { ...process.env };
  Object.assign(process.env, env);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../lib/athena');
  return {
    mod,
    restore: () => {
      process.env = prev;
    },
  };
}

describe('StartQueryExecution result reuse', () => {
  it('asks for reuse of results up to 60 minutes old', async () => {
    const { mod, restore } = loadAthena({ ATHENA_RESULT_REUSE: undefined });
    try {
      await mod.executeQueryUncached('SELECT 1');
      expect(startCommandInputs).toHaveLength(1);
      expect(startCommandInputs[0]).toMatchObject({
        ResultReuseConfiguration: {
          ResultReuseByAgeConfiguration: { Enabled: true, MaxAgeInMinutes: 60 },
        },
      });
    } finally {
      restore();
    }
  });

  it('omits the reuse config entirely when ATHENA_RESULT_REUSE=0', async () => {
    const { mod, restore } = loadAthena({ ATHENA_RESULT_REUSE: '0' });
    try {
      await mod.executeQueryUncached('SELECT 1');
      // Absent, not `Enabled: false` — the kill switch must leave the request
      // byte-identical to the pre-reuse one so it can be trusted as a rollback.
      expect(startCommandInputs[0]).not.toHaveProperty('ResultReuseConfiguration');
    } finally {
      restore();
    }
  });

  it('still sends the query string, database and output location', async () => {
    const { mod, restore } = loadAthena({
      ATHENA_DATABASE: 'titanlog',
      ATHENA_OUTPUT_BUCKET: 's3://bucket/athena-results/',
    });
    try {
      await mod.executeQueryUncached('SELECT 1');
      expect(startCommandInputs[0]).toMatchObject({
        QueryString: 'SELECT 1',
        QueryExecutionContext: { Database: 'titanlog' },
        ResultConfiguration: { OutputLocation: 's3://bucket/athena-results/' },
      });
    } finally {
      restore();
    }
  });
});
