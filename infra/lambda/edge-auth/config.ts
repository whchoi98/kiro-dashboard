import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { EdgeAuthConfig } from './types';

const SSM_PARAM_NAME = '/kiro-dashboard/edge-auth/config';
const ssm = new SSMClient({ region: 'us-east-1' });

let cachedConfig: EdgeAuthConfig | null = null;

export async function getConfig(): Promise<EdgeAuthConfig> {
  if (cachedConfig) return cachedConfig;

  const result = await ssm.send(
    new GetParameterCommand({ Name: SSM_PARAM_NAME })
  );

  if (!result.Parameter?.Value) {
    throw new Error(`SSM parameter ${SSM_PARAM_NAME} not found or empty`);
  }

  cachedConfig = JSON.parse(result.Parameter.Value) as EdgeAuthConfig;
  return cachedConfig;
}
