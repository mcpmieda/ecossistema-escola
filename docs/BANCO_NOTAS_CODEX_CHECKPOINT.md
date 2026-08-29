# Banco de Notas — Codex Checkpoint

Última atualização: 27/08/2026 — fechamento do ciclo M365/Excel
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge
Head de código fechado antes desta consolidação documental: `a539417e09740db54c4f97ebbb62acc741bd0de2`
CI de código limpa: run `33078535334` — success
D1 homologation final do bloco: run `33078530136` — success
M365 Excel round-trip + cleanup: run `33076985566` — success
Produção: deploy e recovery skipped
Sync: `0`

## Estado consolidado

O ciclo técnico abaixo foi comprovado com dados exclusivamente sintéticos:

```text
professor destinatário
→ Excel Online
→ SharePoint
→ Microsoft Graph
→ analyzer OOXML do Banco de Notas
```

A conta institucional autorizada abriu o workbook em modo de edição, alterou a célula mapeada `B2` de ausência para `8,5`, o Excel salvou o arquivo e o backend encontrou o valor numérico `8.5` no mesmo mapping. Depois da prova, a permissão foi revogada e o XLSX foi removido.

## Concluído

- [x] PR #52 confirmado aberto, draft e sem merge.
- [x] Produção, D1 de produção e Pages de produção preservados.
- [x] Migrations D1 `0001`–`0007` homologadas remotamente.
- [x] D1 final reafirmado no run `33078530136`, com `sync_enabled=0`.
- [x] GitHub OIDC → Entra e `Sites.Selected` comprovados.
- [x] Boundary M365 exclusivo consolidado em `CENTROADMIN → ARQUIVOS_PLATAFORMA → BANCO_NOTAS_HOMOLOGACAO`.
- [x] Serializer OOXML corrigido para ordem canônica de colunas/células e `bookViews` compatível com Excel Online.
- [x] XLSX abriu no Excel Online sem reparação e em modo de edição.
- [x] Sessão destinatária confirmada como `GUI@escolaieda.com`, sem sessão administrativa mascarando o teste.
- [x] Edição sintética controlada: `NotaT1`, célula `B2`, valor anterior nulo, valor novo `8.5`.
- [x] Download pós-edição pelo Graph, MIME XLSX, pacote classificado como `excel_edited` e reanálise OOXML aprovados.
- [x] Mesmo `gradeKey`, `field`, `sheetKey` e `cellAddress` confirmados.
- [x] Ownership institucional comprovado durante o share por `teacher ↔ entraObjectId`.
- [x] Permissão individual revogada e ausência confirmada.
- [x] XLSX temporário removido e ausência confirmada.
- [x] Pasta `BANCO_NOTAS_HOMOLOGACAO` mantida como boundary autorizado.
- [x] `Prefer: bypass-shared-lock` implementado de forma opt-in somente para remoção explícita sob lock WOPI.
- [x] Job M365 one-shot removido da CI.
- [x] Teste externo temporário removido; gates unitários permanentes preservados.
- [x] OID/UPN reais removidos do workflow D1 padrão.
- [x] CI limpa pós-remoção aprovada: `302/302` testes em `55` arquivos, build e segurança verdes.

## Distinção de identificadores

Não confundir:

- `teacherModelId` persistido no D1 de homologação: `homologation-share-model-20260826`;
- `teacherId` persistido no D1 de homologação: `homologation-share-teacher-20260826`;
- `modelId` genérico embutido no workbook: `71111111-1111-4111-8111-111111111111`.

A prova de edição usou:

- `gradeKey`: `2026|73333333-3333-4333-8333-333333333333|74444444-4444-4444-8444-444444444444|75555555-5555-4555-8555-555555555555`;
- `field`: `NotaT1`;
- `sheetKey`: `generated:73333333-3333-4333-8333-333333333333:74444444-4444-4444-8444-444444444444`;
- `cellAddress`: `B2`;
- valor reanalisado: `8.5`.

## Evidência final do cleanup

Artefato redigido do run `33076985566`:

- `status=success`;
- `recipientPermissionAlreadyAbsent=true`;
- `permissionBoundaryVerified=true`;
- `permissionRevocationConfirmed=true`;
- `workbookRemoved=true`;
- `workbookRemovalConfirmed=true`;
- `dedicatedFolderRetained=true`;
- `syncEnabled=false`.

O campo `recipientIdentityMatch=false` nesse estágio não indica destinatário incorreto: a permissão já estava ausente, portanto não existia identidade ativa a comparar. A ausência e o boundary foram confirmados separadamente pelos campos acima.

## Recursos temporários existentes

Nenhum recurso temporário M365 ativo do ensaio:

- nenhum XLSX sintético retido;
- nenhuma permissão individual ativa criada pelo ensaio;
- nenhum job one-shot M365 na CI;
- nenhum teste externo de tenant na suíte comum.

Permanece apenas a pasta autorizada `BANCO_NOTAS_HOMOLOGACAO` e o histórico sintético/auditável no D1 de homologação com sync desligado.

## Recursos já limpos

- XLSX de storage inicial: removido.
- XLSX diagnóstico: removido.
- Primeira tentativa de share: permission e arquivo compensados.
- XLSX incompatível substituído: permission e item anteriores removidos.
- XLSX editado final: permission revogada e arquivo removido.
- Jobs one-shot de storage/share/substituição/round-trip: removidos.
- OID/UPN autorizados: removidos dos workflows permanentes.

## Baselines e runs principais

- `33003875460` — M365 readiness — success.
- `33025586408` — storage Graph/SharePoint real — success.
- `33026452850` — preparação D1 sintética para share — success.
- `33026888705` — share individual — success.
- `33073736978` — serializer editável no Excel Online — success.
- `33074034916` — substituição controlada do XLSX — success.
- `33075802785` — prova Excel → Graph → analyzer — success.
- `33076985566` — cleanup final sob lock WOPI — success.
- `33078530136` — D1 homologation limpa, sem vínculo pessoal no workflow — success.
- `33078535334` — CI limpa, sem job/teste externo — success.

## Próximo bloco técnico seguro

1. preservar a homologação NAA real já concluída e a registration credential-free;
2. provar bearer e ownership end-to-end somente em runtime de homologação explicitamente autorizado;
3. manter o endpoint público bloqueado e `sync_enabled=0` até esse gate;
4. comprovar atomicidade por binding `D1Database.batch()` em runtime Cloudflare de homologação autorizado;
5. avançar os módulos funcionais: Acompanhamento, Alunos, Turmas, Professores e Pesquisa.

## Não fazer ao retomar

- não recriar o XLSX/share já homologados;
- não reintroduzir OID/UPN em workflows permanentes;
- não habilitar sync;
- não publicar add-in;
- não tocar produção;
- não aplicar o stash antigo automaticamente;
- não introduzir golden master privado em fixture ou runtime.

## Invariantes

- D1 continua sendo a fonte estruturada/transacional.
- SharePoint/OneDrive continuam sendo o boundary de arquivos/modelos.
- Graph continua backend-only.
- O produto continua gerando um **modelo genérico limpo**.
- Os **golden masters privados externos** continuam fora de Git, runtime, D1, fixtures públicas e distribuição.

## Hardening Entra v2 do add-in — 27/08/2026

- Corrigida a semântica de access token v2: `aud` é o client ID GUID da API, não o App ID URI.
- `api://<client-id>/BancoNotas.Sync` permanece sendo o scope solicitado pelo cliente.
- O bearer agora valida `ver=2.0`, `azp` self-preauthorized e rejeita drift de cliente confidencial quando `azpacr` estiver presente.
- `BANCO_NOTAS_ADDIN_AUDIENCE` passa a exigir UUID.
- O plano Entra removeu `Directory.Read.All`; nenhuma escrita no tenant foi feita.
- Endpoint público desconectado, sync `0`, produção intocada e PR #52 draft.
- Evidência: `docs/BANCO_NOTAS_ENTRA_ADDIN_TOKEN_V2_HARDENING_2026-08-27.md`.
- Gate histórico concluído: auditoria Entra read-only executada antes do apply.

## Homologação NAA real — 27/08/2026

- Registration Entra credential-free criada e auditada.
- Audience GUID e delegated scope `BancoNotas.Sync` homologados.
- Redirect bridge dedicada implementada para MSAL Browser v5.
- Excel Online obteve silenciosamente token v2 real em 662 ms; checks de tenant, issuer, audience, scope, authorized party, lifetime e presença de OID passaram.
- Evidência sanitizada sem token, UPN ou valor de OID em `docs/BANCO_NOTAS_NAA_HOMOLOGATION_2026-08-27.md`.
- Redirect local removido; zero permissões Graph, grants, app roles, secrets ou certificados.
- Rota pública desconectada, `sync_enabled=0`, nenhum deploy e nenhum merge.

## Auditoria Entra read-only do add-in — 27/08/2026

- Run `33092136016` aprovado com GitHub OIDC e Microsoft Graph GET-only.
- Resultado: `success_no_candidate`; zero registrations com o nome canônico.
- `Application.ReadWrite.OwnedBy` listou o tenant com sucesso; a referência oficial permite `GET /applications` para todas as applications.
- Nenhuma escrita no tenant ocorreu; nenhuma application, service principal, permissão, consentimento ou credencial foi alterada.
- Endpoint público desconectado, sync `0`, produção intocada e PR #52 draft.
- Evidência: `docs/BANCO_NOTAS_ENTRA_ADDIN_AUDIT_2026-08-27.md`.
- Gate histórico concluído: registration de homologação credential-free criada sem publicar o add-in.

## Experiência Cotidiana do Add-in V1 — checkpoint local (29/08/2026)

- Branch: `feat/banco-notas-addin-cotidiano-v1` sobre `3e02f80b3dd07d00eef63f5d481ba4250c14c9e5`.
- Implementação, contratos, documentação, testes e Browser QA sintético concluídos.
- Gate local: 421/421 testes, verify, manifest, builds, audit high 0 e diff check PASS.
- Excel Online real não repetido por ausência de sessão existente; nenhuma publicação/sideload/login.
- Context route fail-closed; grade-events público desconectado; sync `0`; produção/D1 remoto/Graph/Entra intactos.
- Próximo passo seguro: commit, PR Draft, CI completa, zero deployments e integração controlada `[skip ci]`.

`BANCO_NOTAS_ADDIN_COTIDIANO_V1_PASSED`

- Commit funcional `1f90120d786f14b3b8ba4180f15c4bc5936906f2` no PR Draft #138.
- CI `33246218011` e Semgrep `33246218042`: PASS.
- Merge state CLEAN; reviews/threads 0; deployments 0; produção/recovery/cleanup skipped.
- Aguardar CI do commit de evidências e integrar com merge `[skip ci]` se o estado permanecer limpo.
