import { GlueClient, GetTablesCommand } from '@aws-sdk/client-glue';

const client = new GlueClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export async function resolveTableName(): Promise<string> {
  if (process.env.GLUE_TABLE_NAME) {
    return process.env.GLUE_TABLE_NAME;
  }

  const response = await client.send(
    new GetTablesCommand({
      DatabaseName: process.env.ATHENA_DATABASE,
    })
  );

  const tables = response.TableList ?? [];
  if (tables.length === 0) {
    throw new Error('No tables found in Glue database');
  }

  return tables[0].Name!;
}
