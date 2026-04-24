jest.mock('@aws-sdk/client-glue', () => {
  const mockSend = jest.fn();
  return {
    GlueClient: jest.fn(() => ({ send: mockSend })),
    GetTablesCommand: jest.fn((input: unknown) => ({ input })),
    __mockSend: mockSend,
  };
});

import { resolveTableName } from '../../lib/glue';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mockSend: mockSend } = require('@aws-sdk/client-glue');

describe('resolveTableName', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns GLUE_TABLE_NAME env var when set', async () => {
    process.env.GLUE_TABLE_NAME = 'my_custom_table';
    const result = await resolveTableName();
    expect(result).toBe('my_custom_table');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('queries Glue API when GLUE_TABLE_NAME is not set', async () => {
    delete process.env.GLUE_TABLE_NAME;
    mockSend.mockResolvedValue({
      TableList: [{ Name: 'discovered_table' }, { Name: 'other_table' }],
    });

    const result = await resolveTableName();
    expect(result).toBe('discovered_table');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('throws when Glue returns no tables', async () => {
    delete process.env.GLUE_TABLE_NAME;
    mockSend.mockResolvedValue({ TableList: [] });

    await expect(resolveTableName()).rejects.toThrow('No tables found in Glue database');
  });
});
