# Banco de Notas — hardening do token Entra v2 do add-in

Data: 27/08/2026

## Correção aplicada

O contrato agora separa explicitamente três conceitos que não podem ser confundidos:

- `resourceApplicationIdUri`: `api://<application-client-id>`, usado para expor e solicitar o delegated scope;
- `tokenAudience`: `<application-client-id>` em formato GUID, valor esperado no claim `aud` de access tokens v2;
- `authorizedParty`: `<application-client-id>` em formato GUID, valor esperado no claim `azp` para a app NAA self-preauthorized.

O scope solicitado pelo cliente continua sendo `api://<application-client-id>/BancoNotas.Sync`, enquanto o runtime recebe `BANCO_NOTAS_ADDIN_AUDIENCE=<application-client-id>` e `BANCO_NOTAS_ADDIN_SCOPE=BancoNotas.Sync`.

## Verificação fail-closed

O backend valida assinatura RS256, chave `kid`, `ver=2.0`, issuer, tenant, audience GUID, lifetime, delegated scope, `oid` e `azp`. Quando `azpacr` estiver presente, somente `0` é aceito; valores de client secret ou certificado são rejeitados, sem criar dependência rígida da presença desse claim opcional.

A autorização por ownership `teacherModelId ↔ teacher ↔ entraObjectId` e os gates D1 de autoridade/sync permanecem depois da autenticação do bearer.

## Privilégio mínimo e invariantes

- plano read-only: somente `Application.Read.All`;
- apply explícito: somente `Application.ReadWrite.All`;
- `Directory.Read.All` removido por não ser necessário para `/applications`;
- nenhum secret, certificado ou permissão Graph é criado na app do add-in;
- nenhuma escrita no tenant foi executada neste bloco;
- endpoint público continua desconectado;
- sync continua `0`;
- produção, D1 de produção e Pages de produção permanecem intocados;
- PR #52 continua open, draft e sem merge.

## Próximo gate

Executar a auditoria Entra read-only com o contrato corrigido, identificar exatamente zero ou uma registration reutilizável e somente depois decidir um apply de homologação separado e explícito.
