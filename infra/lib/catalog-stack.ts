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
  }
}
