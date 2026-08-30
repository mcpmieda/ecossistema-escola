const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type BancoNotasNaaConfig = {
  clientId: string;
  tenantId: string;
  authority: string;
  redirectUri: string;
  requestedScope: string;
  delegatedScope: 'BancoNotas.Sync';
  expectedIssuer: string;
};

export function createBancoNotasNaaConfig(input: {
  clientId?: string;
  tenantId?: string;
  origin: string;
}): BancoNotasNaaConfig {
  const clientId = input.clientId?.trim() ?? '';
  const tenantId = input.tenantId?.trim() ?? '';
  if (!guidPattern.test(clientId) || !guidPattern.test(tenantId)) {
    throw new Error('NAA_CONFIG_INVALID');
  }

  const delegatedScope = 'BancoNotas.Sync' as const;
  return {
    clientId,
    tenantId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: `${input.origin}/banco-de-notas/addin/auth`,
    requestedScope: `api://${clientId}/${delegatedScope}`,
    delegatedScope,
    expectedIssuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  };
}
