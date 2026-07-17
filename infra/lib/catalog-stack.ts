// Opt-in Glue Data Catalog stack — provisions the `user_report` external
// table over a fork/operator-owned S3 bucket so a fresh `cdk deploy` can
// bring up a fully functional dashboard without the maintainer's Glue
// crawler. Only instantiated when `ATHENA_DATA_BUCKET_NAME` is set.
//
// Column schema mirrors Kiro's public "User Activity Report" docs (11
// fixed columns). Dynamic `{model}_messages` columns are intentionally
// NOT registered — they are read S3-direct by `/api/model-usage`
// because OpenCSVSerDe positional mapping would misalign them.

import * as cdk from 'aws-cdk-lib';
import * as glue from 'aws-cdk-lib/aws-glue';
import { Construct } from 'constructs';

export interface CatalogStackProps extends cdk.StackProps {
  databaseName: string;
  tableName: string;
  dataBucket: string;
  reportPrefix: string;
  /**
   * S3 prefix of the legacy `by_user_analytic` report. When omitted it is
   * derived from `reportPrefix` by swapping the `user_report` path segment
   * (Kiro delivers both reports as siblings under `KiroLogs/`). If neither
   * an explicit prefix is given nor derivation is possible, the legacy
   * table is skipped with a synth-time warning.
   */
  byUserAnalyticPrefix?: string;
}

const USER_REPORT_COLUMNS: Array<{ name: string; type: string }> = [
  { name: 'date', type: 'string' },
  { name: 'userid', type: 'string' },
  { name: 'client_type', type: 'string' },
  { name: 'chat_conversations', type: 'int' },
  { name: 'credits_used', type: 'double' },
  { name: 'overage_cap', type: 'double' },
  { name: 'overage_credits_used', type: 'double' },
  { name: 'overage_enabled', type: 'string' },
  { name: 'profileid', type: 'string' },
  { name: 'subscription_tier', type: 'string' },
  { name: 'total_messages', type: 'int' },
];

// Legacy per-user productivity report, queried by /api/productivity.
// All columns are declared `string` — OpenCSVSerDe hands every value back
// as text and the routes CAST explicitly (see the analyze system prompt's
// SQL rules). Order mirrors docs/kiro-user-activity-report-schema.md §B.
const BY_USER_ANALYTIC_COLUMNS: Array<{ name: string; type: string }> = [
  { name: 'userid', type: 'string' },
  { name: 'date', type: 'string' },
  { name: 'chat_aicodelines', type: 'string' },
  { name: 'chat_messagesinteracted', type: 'string' },
  { name: 'chat_messagessent', type: 'string' },
  { name: 'inline_suggestionscount', type: 'string' },
  { name: 'inline_acceptancecount', type: 'string' },
  { name: 'inline_aicodelines', type: 'string' },
  { name: 'inlinechat_totaleventcount', type: 'string' },
  { name: 'inlinechat_acceptanceeventcount', type: 'string' },
  { name: 'inlinechat_acceptedlineadditions', type: 'string' },
  { name: 'inlinechat_acceptedlinedeletions', type: 'string' },
  { name: 'inlinechat_rejectioneventcount', type: 'string' },
  { name: 'inlinechat_rejectedlineadditions', type: 'string' },
  { name: 'inlinechat_rejectedlinedeletions', type: 'string' },
  { name: 'inlinechat_dismissaleventcount', type: 'string' },
  { name: 'inlinechat_dismissedlineadditions', type: 'string' },
  { name: 'inlinechat_dismissedlinedeletions', type: 'string' },
  { name: 'dev_generationeventcount', type: 'string' },
  { name: 'dev_generatedlines', type: 'string' },
  { name: 'dev_acceptanceeventcount', type: 'string' },
  { name: 'dev_acceptedlines', type: 'string' },
  { name: 'codefix_generationeventcount', type: 'string' },
  { name: 'codefix_generatedlines', type: 'string' },
  { name: 'codefix_acceptanceeventcount', type: 'string' },
  { name: 'codefix_acceptedlines', type: 'string' },
  { name: 'codereview_succeededeventcount', type: 'string' },
  { name: 'codereview_failedeventcount', type: 'string' },
  { name: 'codereview_findingscount', type: 'string' },
  { name: 'testgeneration_eventcount', type: 'string' },
  { name: 'testgeneration_generatedtests', type: 'string' },
  { name: 'testgeneration_generatedlines', type: 'string' },
  { name: 'testgeneration_acceptedtests', type: 'string' },
  { name: 'testgeneration_acceptedlines', type: 'string' },
  { name: 'docgeneration_eventcount', type: 'string' },
  { name: 'docgeneration_acceptedfilescreations', type: 'string' },
  { name: 'docgeneration_acceptedfileupdates', type: 'string' },
  { name: 'docgeneration_acceptedlineadditions', type: 'string' },
  { name: 'docgeneration_acceptedlineupdates', type: 'string' },
  { name: 'docgeneration_rejectedfilecreations', type: 'string' },
  { name: 'docgeneration_rejectedfileupdates', type: 'string' },
  { name: 'docgeneration_rejectedlineadditions', type: 'string' },
  { name: 'docgeneration_rejectedlineupdates', type: 'string' },
  { name: 'transformation_eventcount', type: 'string' },
  { name: 'transformation_linesgenerated', type: 'string' },
  { name: 'transformation_linesingested', type: 'string' },
];

export class CatalogStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CatalogStackProps) {
    super(scope, id, props);

    const database = new glue.CfnDatabase(this, 'Database', {
      catalogId: this.account,
      databaseInput: {
        name: props.databaseName,
        description: 'Kiro Dashboard — Glue database for user_report + by_user_analytic',
      },
    });

    const table = new glue.CfnTable(this, 'UserReportTable', {
      catalogId: this.account,
      databaseName: props.databaseName,
      tableInput: {
        name: props.tableName,
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          classification: 'csv',
          'skip.header.line.count': '1',
          typeOfData: 'file',
        },
        storageDescriptor: {
          columns: USER_REPORT_COLUMNS.map((c) => ({ name: c.name, type: c.type })),
          location: `s3://${props.dataBucket}/${props.reportPrefix}`,
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          compressed: false,
          serdeInfo: {
            serializationLibrary: 'org.apache.hadoop.hive.serde2.OpenCSVSerde',
            parameters: {
              separatorChar: ',',
              quoteChar: '"',
              escapeChar: '\\',
            },
          },
        },
      },
    });

    // CFN would otherwise provision both resources in parallel and the
    // table creation would fail with "Database <name> not found".
    table.addDependency(database);

    // Legacy by_user_analytic table — feeds /api/productivity. Delivered by
    // Kiro as a sibling of user_report under KiroLogs/.
    const byUserAnalyticPrefix =
      props.byUserAnalyticPrefix ??
      (props.reportPrefix.includes('user_report')
        ? props.reportPrefix.replace('user_report', 'by_user_analytic')
        : undefined);

    if (byUserAnalyticPrefix) {
      const byUserAnalyticTable = new glue.CfnTable(this, 'ByUserAnalyticTable', {
        catalogId: this.account,
        databaseName: props.databaseName,
        tableInput: {
          name: 'by_user_analytic',
          tableType: 'EXTERNAL_TABLE',
          parameters: {
            classification: 'csv',
            'skip.header.line.count': '1',
            typeOfData: 'file',
          },
          storageDescriptor: {
            columns: BY_USER_ANALYTIC_COLUMNS.map((c) => ({ name: c.name, type: c.type })),
            location: `s3://${props.dataBucket}/${byUserAnalyticPrefix}`,
            inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
            outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
            compressed: false,
            serdeInfo: {
              serializationLibrary: 'org.apache.hadoop.hive.serde2.OpenCSVSerde',
              parameters: {
                separatorChar: ',',
                quoteChar: '"',
                escapeChar: '\\',
              },
            },
          },
        },
      });
      byUserAnalyticTable.addDependency(database);
    } else {
      cdk.Annotations.of(this).addWarningV2(
        'kiro-dashboard:no-by-user-analytic',
        `Could not derive the by_user_analytic S3 prefix from reportPrefix "${props.reportPrefix}" — /productivity will render empty. Set BY_USER_ANALYTIC_PREFIX to provision the legacy table.`,
      );
    }
  }
}
