-- Athena DDL for the Kiro "User Activity Report" table.
--
-- Manual alternative to the opt-in `KiroDashboardCatalog` CDK stack —
-- useful if you want to keep the Glue database managed outside CDK or
-- when registering the table in a region that differs from the CDK
-- deployment region. The CDK stack already provisions both database
-- and table; running this file is only necessary when you skip the
-- Catalog stack.
--
-- Replace <DATA_BUCKET> and <REPORT_PREFIX> with values that match the
-- S3 location of your Kiro User Activity Report CSV files, e.g.
-- s3://my-kiro-logs/q-user-log/AWSLogs/<account>/KiroLogs/user_report/us-east-1/
--
-- Dynamic `{model}_messages` columns (emitted from 2026-03-12 onwards)
-- are intentionally NOT part of this table. The dashboard's
-- `/api/model-usage` route reads the CSV files S3-direct because
-- OpenCSVSerDe's positional mapping would misalign them.

CREATE DATABASE IF NOT EXISTS titanlog;

CREATE EXTERNAL TABLE IF NOT EXISTS titanlog.user_report (
  date STRING,
  userid STRING,
  client_type STRING,
  chat_conversations INT,
  credits_used DOUBLE,
  overage_cap DOUBLE,
  overage_credits_used DOUBLE,
  overage_enabled STRING,
  profileid STRING,
  subscription_tier STRING,
  total_messages INT
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
STORED AS INPUTFORMAT 'org.apache.hadoop.mapred.TextInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://<DATA_BUCKET>/<REPORT_PREFIX>'
TBLPROPERTIES (
  'classification' = 'csv',
  'skip.header.line.count' = '1',
  'typeOfData' = 'file'
);
