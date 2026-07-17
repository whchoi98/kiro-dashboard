import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CatalogStack } from '../../infra/lib/catalog-stack';

function synthCatalog(overrides?: {
  databaseName?: string;
  tableName?: string;
  dataBucket?: string;
  reportPrefix?: string;
  byUserAnalyticPrefix?: string;
}) {
  const app = new cdk.App();
  const stack = new CatalogStack(app, 'KiroDashboardCatalog', {
    // Default to us-east-1 because the ECS task queries Athena in that
    // region — the Catalog must land where the ECS task looks.
    env: { account: '111111111111', region: 'us-east-1' },
    databaseName: overrides?.databaseName ?? 'titanlog',
    tableName: overrides?.tableName ?? 'user_report',
    dataBucket: overrides?.dataBucket ?? 'my-kiro-logs-bucket',
    reportPrefix: overrides?.reportPrefix ?? 'q-user-log/AWSLogs/111111111111/KiroLogs/user_report/us-east-1/',
    byUserAnalyticPrefix: overrides?.byUserAnalyticPrefix,
  });
  return Template.fromStack(stack);
}

describe('CatalogStack', () => {
  it('creates the Glue database with the configured name', () => {
    const template = synthCatalog({ databaseName: 'my_titanlog' });
    template.hasResourceProperties('AWS::Glue::Database', {
      DatabaseInput: Match.objectLike({ Name: 'my_titanlog' }),
    });
  });

  it('creates a Glue table with the 11 fixed Kiro user_report columns', () => {
    const template = synthCatalog();
    template.hasResourceProperties('AWS::Glue::Table', {
      TableInput: Match.objectLike({
        Name: 'user_report',
        TableType: 'EXTERNAL_TABLE',
        StorageDescriptor: Match.objectLike({
          Columns: [
            { Name: 'date', Type: 'string' },
            { Name: 'userid', Type: 'string' },
            { Name: 'client_type', Type: 'string' },
            { Name: 'chat_conversations', Type: 'int' },
            { Name: 'credits_used', Type: 'double' },
            { Name: 'overage_cap', Type: 'double' },
            { Name: 'overage_credits_used', Type: 'double' },
            { Name: 'overage_enabled', Type: 'string' },
            { Name: 'profileid', Type: 'string' },
            { Name: 'subscription_tier', Type: 'string' },
            { Name: 'total_messages', Type: 'int' },
          ],
        }),
      }),
    });
  });

  it('configures OpenCSVSerDe with header-skip', () => {
    const template = synthCatalog();
    template.hasResourceProperties('AWS::Glue::Table', {
      TableInput: Match.objectLike({
        StorageDescriptor: Match.objectLike({
          SerdeInfo: Match.objectLike({
            SerializationLibrary: 'org.apache.hadoop.hive.serde2.OpenCSVSerde',
          }),
          Location: `s3://my-kiro-logs-bucket/q-user-log/AWSLogs/111111111111/KiroLogs/user_report/us-east-1/`,
        }),
        Parameters: Match.objectLike({ 'skip.header.line.count': '1' }),
      }),
    });
  });

  it('declares a CloudFormation DependsOn so the table waits for the database', () => {
    // Without this, CFN provisions both resources in parallel and the
    // table creation fails with "Database <name> not found".
    const template = synthCatalog();
    const tables = template.findResources('AWS::Glue::Table');
    const [tableDef] = Object.values(tables);
    expect((tableDef as any).DependsOn).toContain('Database');
  });

  it('respects a custom report prefix verbatim in S3 Location', () => {
    const template = synthCatalog({
      dataBucket: 'bucket-x',
      reportPrefix: 'my/custom/prefix/',
    });
    template.hasResourceProperties('AWS::Glue::Table', {
      TableInput: Match.objectLike({
        StorageDescriptor: Match.objectLike({
          Location: 's3://bucket-x/my/custom/prefix/',
        }),
      }),
    });
  });
});

describe('CatalogStack — legacy by_user_analytic table', () => {
  // /productivity queries by_user_analytic; without this table a fresh
  // account renders that page permanently empty even after CSVs arrive.

  it('provisions by_user_analytic with the 46 documented columns, gated on the database', () => {
    const template = synthCatalog();
    template.resourceCountIs('AWS::Glue::Table', 2);

    const tables = template.findResources('AWS::Glue::Table');
    const byUser = Object.values(tables).find(
      (t: any) => t.Properties.TableInput.Name === 'by_user_analytic',
    ) as any;
    expect(byUser).toBeDefined();

    const columns = byUser.Properties.TableInput.StorageDescriptor.Columns;
    expect(columns).toHaveLength(46);
    expect(columns[0]).toEqual({ Name: 'userid', Type: 'string' });
    expect(columns[1]).toEqual({ Name: 'date', Type: 'string' });
    expect(byUser.DependsOn).toContain('Database');
  });

  it('derives the by_user_analytic S3 location from the user_report prefix', () => {
    // Kiro delivers the legacy report as a sibling of user_report:
    // .../KiroLogs/user_report/<region>/ → .../KiroLogs/by_user_analytic/<region>/
    const template = synthCatalog();
    template.hasResourceProperties('AWS::Glue::Table', {
      TableInput: Match.objectLike({
        Name: 'by_user_analytic',
        StorageDescriptor: Match.objectLike({
          Location:
            's3://my-kiro-logs-bucket/q-user-log/AWSLogs/111111111111/KiroLogs/by_user_analytic/us-east-1/',
        }),
      }),
    });
  });

  it('honors an explicit byUserAnalyticPrefix over derivation', () => {
    const template = synthCatalog({ byUserAnalyticPrefix: 'legacy/reports/' });
    template.hasResourceProperties('AWS::Glue::Table', {
      TableInput: Match.objectLike({
        Name: 'by_user_analytic',
        StorageDescriptor: Match.objectLike({
          Location: 's3://my-kiro-logs-bucket/legacy/reports/',
        }),
      }),
    });
  });

  it('skips the legacy table when the location cannot be derived from a custom prefix', () => {
    const template = synthCatalog({ reportPrefix: 'my/custom/prefix/' });
    template.resourceCountIs('AWS::Glue::Table', 1);
  });

  it('replaces the user_report PATH SEGMENT, not the first substring occurrence', () => {
    // A prefix whose earlier segment merely contains the substring
    // (team-user_reports) must not be rewritten — only the real
    // /user_report/ path segment swaps.
    const template = synthCatalog({
      reportPrefix: 'team-user_reports/KiroLogs/user_report/us-east-1/',
    });
    template.hasResourceProperties('AWS::Glue::Table', {
      TableInput: Match.objectLike({
        Name: 'by_user_analytic',
        StorageDescriptor: Match.objectLike({
          Location:
            's3://my-kiro-logs-bucket/team-user_reports/KiroLogs/by_user_analytic/us-east-1/',
        }),
      }),
    });
  });

  it('skips the legacy table when user_report appears only inside another segment', () => {
    // 'kiro-user_reports' contains the substring but is not a user_report
    // path segment — deriving here would point the table at a nonexistent
    // prefix, so the stack must fall back to skip-with-warning instead.
    const template = synthCatalog({ reportPrefix: 'exports/kiro-user_reports/us-east-1/' });
    template.resourceCountIs('AWS::Glue::Table', 1);
  });
});
