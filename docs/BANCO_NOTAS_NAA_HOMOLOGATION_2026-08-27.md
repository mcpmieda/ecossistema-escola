# Homologação NAA do Banco de Notas — 27/08/2026

## Resultado

A autenticação Nested App Authentication (NAA) foi comprovada em uma sessão real do Excel Online. O add-in obteve silenciosamente um access token delegado v2 para a própria API em 662 ms. Todos os checks de tenant, issuer, audience, scope, authorized party, lifetime e presença de OID passaram.

A evidência sanitizada está em `docs/evidence/BancoNotas-NAA-Token-Proof-2026-08-27.json`. Ela não contém access token, UPN nem valor de OID.

## Causa raiz e correção

O harness anterior usava MSAL Browser 5.19.0, mas tratava o próprio taskpane como redirect. No MSAL Browser v5, o redirect precisa ser uma página dedicada que execute `broadcastResponseToMainFrame()`. A ausência dessa ponte produzia timeouts próximos dos limites padrão de 10 s no iframe e 60 s no popup.

A implementação agora:

- fixa `@azure/msal-browser` em 5.19.0;
- usa `auth.html` dedicado, sem cache, para a redirect bridge;
- inicializa `createNestablePublicClientApplication` apenas quando Office NAA 1.1 está disponível;
- tenta `acquireTokenSilent` e mantém popup somente como fallback;
- registra apenas eventos e claims sanitizados, nunca o token bruto ou PII;
- falha fechado quando tenant/client ID/configuração não são válidos.

Referências oficiais:

- [Nested App Authentication em Office Add-ins](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/create-sso-office-add-ins-aspnet)
- [MSAL Browser v5 redirect bridge](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/redirect-bridge.md)
- [Migração MSAL Browser v4 para v5](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/v4-migration.md)
- [Requirement set NestedAppAuth 1.1](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/common/nested-app-auth-requirement-sets)
- [Amostra oficial Office NAA](https://github.com/OfficeDev/Office-Add-in-samples/tree/main/Samples/auth/Office-Add-in-SSO-NAA)

## Estado final do Entra

- uma application registration de homologação, credential-free;
- access tokens v2;
- um delegated scope `BancoNotas.Sync` da própria API;
- self-preauthorization para esse scope;
- um único `requiredResourceAccess`, para o próprio app e do tipo `Scope`;
- zero permissões Microsoft Graph na application registration;
- zero app roles;
- zero OAuth2 permission grants;
- zero secrets e certificados;
- redirects finais: broker NAA da origem de produção e `auth.html` dedicado de produção;
- redirect temporário `localhost` removido após a prova.

O audience homologado é o client ID GUID da API; o scope solicitado pelo cliente permanece `api://<client-id>/BancoNotas.Sync`.

## Limites preservados

- `sync_enabled=0`;
- rota pública do add-in desconectada;
- nenhum deploy Cloudflare ou de produção;
- nenhuma migration D1;
- nenhum merge;
- PR #52 permanece open + draft;
- produção atual do Centro permanece inalterada.

Os artefatos estáticos de add-in, manifesto, headers e configuração estão prontos no branch, mas precisam de build/deploy de homologação autorizado antes de testar a URL de produção. Esta homologação não concede autorização para publicar.
