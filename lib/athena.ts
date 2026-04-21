import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from '@aws-sdk/client-athena';

const client = new AthenaClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export async function executeQuery(sql: string): Promise<Record<string, string>[]> {
  const database = process.env.ATHENA_DATABASE;
  const outputBucket = process.env.ATHENA_OUTPUT_BUCKET;

  const startResponse = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: {
        Database: database,
      },
      ResultConfiguration: {
        OutputLocation: outputBucket,
      },
    })
  );

  const queryExecutionId = startResponse.QueryExecutionId!;

  // Poll until the query reaches a terminal state
  while (true) {
    const statusResponse = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );

    const state = statusResponse.QueryExecution?.Status?.State;

    if (state === QueryExecutionState.SUCCEEDED) {
      break;
    }

    if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
      const reason =
        statusResponse.QueryExecution?.Status?.StateChangeReason ?? 'Unknown reason';
      throw new Error(`Query ${state}: ${reason}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const resultsResponse = await client.send(
    new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId })
  );

  const rows = resultsResponse.ResultSet?.Rows ?? [];
  const columnInfo = resultsResponse.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];

  const columns = columnInfo.map((col) => col.Name ?? '');

  // First row is the header row — skip it
  const dataRows = rows.slice(1);

  const mapRows = (rawRows: typeof dataRows) =>
    rawRows.map((row) => {
      const record: Record<string, string> = {};
      const data = row.Data ?? [];
      for (let i = 0; i < columns.length; i++) {
        record[columns[i]] = data[i]?.VarCharValue ?? '';
      }
      return record;
    });

  let allRows = mapRows(dataRows);
  let nextToken = resultsResponse.NextToken;
  while (nextToken) {
    const nextPage = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        NextToken: nextToken,
      })
    );
    const moreRows = (nextPage.ResultSet?.Rows ?? []).map((row) => {
      const record: Record<string, string> = {};
      const data = row.Data ?? [];
      for (let i = 0; i < columns.length; i++) {
        record[columns[i]] = data[i]?.VarCharValue ?? '';
      }
      return record;
    });
    allRows = allRows.concat(moreRows);
    nextToken = nextPage.NextToken;
  }
  return allRows;
}

export function safeFloat(val: string): number {
  const result = parseFloat(val);
  return isNaN(result) ? 0 : result;
}

export function safeInt(val: string): number {
  const result = parseInt(val, 10);
  return isNaN(result) ? 0 : result;
}
