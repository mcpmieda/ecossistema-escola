import { z } from 'zod';

const applicationClientIdToken = '{applicationClientId}';

export const bancoNotasAddinEntraContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: z.literal('homologation'),
    displayName: z.string().trim().min(8).max(120),
    signInAudience: z.literal('AzureADMyOrg'),
    identifierUriTemplate: z.literal(`api://${applicationClientIdToken}`),
    requestedAccessTokenVersion: z.literal(2),
    delegatedScope: z.object({
      value: z.string().regex(/^[A-Za-z][A-Za-z0-9.]{2,119}$/u),
      type: z.literal('Admin'),
      isEnabled: z.literal(true),
      adminConsentDisplayName: z.string().trim().min(8).max(120),
      adminConsentDescription: z.string().trim().min(20).max(400),
    }),
    spaRedirectUriTemplates: z
      .array(z.string().trim().min(8).max(512))
      .min(2)
      .max(6)
      .refine((items) => new Set(items).size === items.length, 'redirect URIs must be unique')
      .refine(
        (items) => items.some((item) => item.startsWith('brk-multihub://')),
        'a brk-multihub broker redirect is required',
      )
      .refine(
        (items) => items.some((item) => item.startsWith('https://')),
        'an HTTPS taskpane redirect is required',
      ),
    preAuthorizeSelf: z.literal(true),
    requiredResourceAccess: z.tuple([]),
    allowPublicClientFlows: z.literal(false),
    credentials: z.literal('none'),
    publicRouteEnabled: z.literal(false),
    syncEnabled: z.literal(false),
  })
  .strict();

export type BancoNotasAddinEntraContract = z.infer<
  typeof bancoNotasAddinEntraContractSchema
>;

export type ResolvedBancoNotasAddinEntraContract = BancoNotasAddinEntraContract & {
  applicationClientId: string;
  audience: string;
  requestedScope: string;
  spaRedirectUris: string[];
};

export function resolveBancoNotasAddinEntraContract(
  contractInput: unknown,
  applicationClientId: string,
): ResolvedBancoNotasAddinEntraContract {
  const contract = bancoNotasAddinEntraContractSchema.parse(contractInput);
  const clientId = z.string().uuid().parse(applicationClientId);
  const replaceClientId = (value: string) =>
    value.replaceAll(applicationClientIdToken, clientId);
  const audience = replaceClientId(contract.identifierUriTemplate);

  return {
    ...contract,
    applicationClientId: clientId,
    audience,
    requestedScope: `${audience}/${contract.delegatedScope.value}`,
    spaRedirectUris: contract.spaRedirectUriTemplates.map(replaceClientId),
  };
}
