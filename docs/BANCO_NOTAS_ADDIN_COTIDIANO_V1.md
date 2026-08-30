# Banco de Notas — Experiência Cotidiana do Add-in V1

Data: 29/08/2026

Branch: `feat/banco-notas-addin-cotidiano-v1`

Base do Sync V1: `main` em `fca06dcf2d874dedbc1f26c596b8c5b5354f6d09`

## Objetivo

O taskpane transforma a prova técnica NAA em uma experiência cotidiana governada: autentica a conta institucional, reconhece o workbook e a guia ativa, obtém o contexto mínimo autorizado, compara células mapeadas e, somente para piloto elegível, oferece Sync V1 explícito.

As ações são **Analisar novamente** e **Sincronizar alterações**. A segunda só é habilitada quando contexto, global switch, commit route, modelo, fonte, piloto, mappings e baselines permitem; o servidor revalida tudo no preflight e no commit.

## Fluxo

1. `Office.onReady` confirma suporte a Nested App Authentication 1.1.
2. MSAL usa a registration, audience GUID, scope delegado e `auth.html` já homologados, com cache somente em memória.
3. Office.js lê apenas a guia interna `_BancoNotas` e a guia ativa.
4. A identidade versionada do workbook é enviada por query ao endpoint read-only.
5. O backend valida bearer v2, OID, ownership e correspondência exata da versão persistida.
6. O DTO retorna labels mínimos, estado, preflight, pendências relevantes e baselines autorizados.
7. Office.js lê somente as células mapeadas da guia ativa e compara localmente; nenhum conteúdo é enviado durante análise.
8. Uma confirmação explícita cria `requestId`, executa preflight e envia no máximo 500 mudanças sem IDs canônicos controlados pelo cliente.
9. Commit atômico grava eventos, snapshots e attempt; timeout consulta outcome pelo mesmo `requestId`.

## API e exposição controlada

`GET /api/banco-notas/v1/addin/context` exige bearer delegado e ownership. A rota falha fechada com 404 enquanto `BANCO_NOTAS_ADDIN_CONTEXT_ENABLED` não for exatamente `1`, e com 503 sem binding D1.

O endpoint de escrita `/api/banco-notas/v1/grade-events` continua desconectado do roteador público. Nenhuma capability administrativa foi reutilizada pelo add-in.

`POST /api/banco-notas/v1/addin/sync/preflight`, `/commit` e `/outcome` exigem o mesmo bearer delegado. POST exige origin oficial; o roteador e o D1 falham fechados. O contrato está em `api/banco-notas-sync-v1.openapi.yaml`.

Contrato: `api/banco-notas-addin-context-v1.openapi.yaml`.

## Identidade do workbook

A versão persistida registra `workbookModelId`, `sourceHash`, `relationshipSnapshotId`, `definitionVersion`, `layoutVersion` e `mappingVersion`. A consulta exige correspondência exata da versão mais recente; `workbookModelId` não é confundido com o ID interno de `teacher_models`.

## Estados da interface

- loading durante inicialização, autenticação e análise;
- auth com suporte NAA e presença de conta apresentados como estados factuais;
- authenticated com professor, ano, turma, componente e modelo;
- sem assignment e sem modelo com mensagens próprias;
- workbook inválido ou guia sem mapping;
- ownership negado;
- sync off como informação administrativa normal;
- ready, warning e blocked derivados do preflight;
- erro genérico e offline/network issue distintos.

## Preflight e pendências

O preflight é read-only e distingue modelo suspenso/indisponível, assignment ausente, fonte autoritativa ausente, mapping desconhecido, baseline indisponível e sync desligado. Somente razões relevantes ao professor são apresentadas.

`sync_enabled=0`, commit route off ou piloto ausente produzem “Sincronização indisponível pela administração enquanto o piloto não está ativo”; não são tratados como falha técnica. O botão só habilita com todos os gates e ao menos uma mudança com baseline.

## Alterações detectadas

Cada mapping autorizado contém endereço, campo, label do estudante e baseline. A comparação local preserva quatro casos:

- valor conhecido inalterado;
- zero numérico conhecido;
- ausência conhecida;
- baseline desconhecido, excluído da contagem de mudanças.

O preview é limitado a 25 alterações, o contexto limita mappings a 5.000 e cada commit limita 500 mudanças. A UI mostra quantidade de campos, estudantes afetados e transição factual. Fórmula alterada é bloqueada; nenhum valor é enviado antes da confirmação explícita.

## Segurança e privacidade

- token somente em memória e apenas no header `Authorization`;
- OID usado somente no backend para ownership;
- token, claims, OID, tenant ID, UPN, email, IDs Graph/Drive e `teacher_model_id` não entram no DTO nem na UI;
- sem client secret, certificado ou nova permissão Microsoft/Graph;
- sem acesso direto do frontend ao Graph ou SharePoint;
- política global anti-framing e exceções específicas do add-in preservadas;
- nenhuma permissão Graph nova; escrita é exclusivamente D1, atômica e restrita ao piloto elegível.

## Verificação

Cobertura dedicada usa fixtures sintéticas e inclui metadata válida/inválida, guia desconhecida, contexto com bearer, bearer ausente/inválido, ownership negado, modelo ausente, storage indisponível, sync desligado, zero, ausência, baseline desconhecido, mudanças, nenhuma mudança, falha de rede e estados de UI.

A regressão NAA existente, validação do manifest, builds web/add-in, contrato semântico, `npm audit --audit-level=high`, `git diff --check` e Browser QA do taskpane são gates de publicação do PR Draft. Excel Online real é tentado somente se as sessões existentes de homologação permitirem, sem publicar ou criar infraestrutura.

## Limites preservados

- distribuição e ativação continuam condicionadas ao change plan e à coorte canônica;
- endpoint legado de grade-events continua desconectado;
- antes do deploy read-only e do piloto real, `sync_enabled=0` deve permanecer preservado;
- rollout amplo é proibido: somente modelos classificados `ready` entram em elegibilidade gradual.

## Estado

Gate local e QA sintética concluídos em 29/08/2026:

- `npm run verify`: PASS;
- 421 testes em 85 arquivos: PASS;
- formatação, lint, tipos e contrato semântico: PASS;
- manifest Office: válido;
- builds web e add-in: PASS;
- `npm audit --audit-level=high`: 0 vulnerabilidades;
- `git diff --check`: PASS;
- Browser QA em 360 × 800 e 280 × 720: loading, auth, warning/sync off, blocked/sem assignment/modelo suspenso, offline e ownership negado; preview de zero e ausência; nenhuma ação de sync; zero overflow global e zero erros de console;
- fixture, servidor, aba e viewport temporários encerrados/removidos;
- Excel Online real: não executado, pois não havia sessão existente no navegador; nenhum login, sideload, upload ou publicação foi iniciado. A regressão NAA real previamente homologada permaneceu verde.

Status local: `BANCO_NOTAS_ADDIN_COTIDIANO_V1_PASSED`.

Publicação inicial:

- commit funcional: `1f90120d786f14b3b8ba4180f15c4bc5936906f2`;
- PR Draft: `#138 — Banco de Notas: Experiência Cotidiana do Add-in V1`;
- primeira rodada CI `33246218011`: Validate application e Validate GitHub Actions security PASS;
- primeira rodada Semgrep `33246218042`: PASS;
- CodeRabbit: PASS com review automático corretamente skipped por o PR permanecer Draft;
- reviews e review threads pendentes: 0;
- Factory Merge Train, deploy, recovery e cleanup: skipped;
- deployments associados ao head: 0;
- merge state: `CLEAN`.

O histórico acima registra a entrega read-only original. O Sync V1 é evoluído no PR próprio a partir da `main` `fca06dcf2d874dedbc1f26c596b8c5b5354f6d09`; distribuição e ativação continuam condicionadas aos gates do change plan.
