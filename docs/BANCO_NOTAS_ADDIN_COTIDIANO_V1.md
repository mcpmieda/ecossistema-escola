# Banco de Notas — Experiência Cotidiana do Add-in V1

Data: 29/08/2026

Branch: `feat/banco-notas-addin-cotidiano-v1`

Base: `main` em `3e02f80b3dd07d00eef63f5d481ba4250c14c9e5`

## Objetivo

O taskpane transforma a prova técnica NAA em uma experiência cotidiana read-only: autentica a conta institucional, reconhece o workbook e a guia ativa, obtém o contexto mínimo autorizado, executa preflight e compara células mapeadas com o estado conhecido.

Esta V1 não envia, ingere nem persiste notas. A única ação é **Analisar novamente**.

## Fluxo

1. `Office.onReady` confirma suporte a Nested App Authentication 1.1.
2. MSAL usa a registration, audience GUID, scope delegado e `auth.html` já homologados, com cache somente em memória.
3. Office.js lê apenas a guia interna `_BancoNotas` e a guia ativa.
4. A identidade versionada do workbook é enviada por query ao endpoint read-only.
5. O backend valida bearer v2, OID, ownership e correspondência exata da versão persistida.
6. O DTO retorna labels mínimos, estado, preflight, pendências relevantes e baselines autorizados.
7. Office.js lê somente as células mapeadas da guia ativa e compara localmente; nenhum conteúdo de célula é enviado.

## API e exposição controlada

`GET /api/banco-notas/v1/addin/context` exige bearer delegado e ownership. A rota falha fechada com 404 enquanto `BANCO_NOTAS_ADDIN_CONTEXT_ENABLED` não for exatamente `1`, e com 503 sem binding D1.

O endpoint de escrita `/api/banco-notas/v1/grade-events` continua desconectado do roteador público. Nenhuma capability administrativa foi reutilizada pelo add-in.

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

`sync_enabled=0` produz “Sincronização indisponível pela administração enquanto o piloto não está ativo”; não é tratado como falha técnica. Mesmo se o estado administrativo vier habilitado, esta V1 informa que não envia alterações.

## Alterações detectadas

Cada mapping autorizado contém endereço, campo, label do estudante e baseline. A comparação local preserva quatro casos:

- valor conhecido inalterado;
- zero numérico conhecido;
- ausência conhecida;
- baseline desconhecido, excluído da contagem de mudanças.

O preview é limitado a 25 alterações e o endpoint limita mappings a 5.000. A UI mostra quantidade de campos, estudantes afetados e transição factual. Nenhuma mudança é persistida ou enviada.

## Segurança e privacidade

- token somente em memória e apenas no header `Authorization`;
- OID usado somente no backend para ownership;
- token, claims, OID, tenant ID, UPN, email, IDs Graph/Drive e `teacher_model_id` não entram no DTO nem na UI;
- sem client secret, certificado ou nova permissão Microsoft/Graph;
- sem acesso direto do frontend ao Graph ou SharePoint;
- política global anti-framing e exceções específicas do add-in preservadas;
- nenhuma escrita D1 remota, alteração Entra/Graph, publicação do add-in ou deploy de produção.

## Verificação

Cobertura dedicada usa fixtures sintéticas e inclui metadata válida/inválida, guia desconhecida, contexto com bearer, bearer ausente/inválido, ownership negado, modelo ausente, storage indisponível, sync desligado, zero, ausência, baseline desconhecido, mudanças, nenhuma mudança, falha de rede e estados de UI.

A regressão NAA existente, validação do manifest, builds web/add-in, contrato semântico, `npm audit --audit-level=high`, `git diff --check` e Browser QA do taskpane são gates de publicação do PR Draft. Excel Online real é tentado somente se as sessões existentes de homologação permitirem, sem publicar ou criar infraestrutura.

## Limites preservados

- add-in não publicado;
- rota de contexto não ativada em produção;
- endpoint de ingestão público continua desconectado;
- `sync_enabled=0` preservado;
- produção, D1 remoto, Graph e Entra intactos;
- Piloto Controlado / Sync V1 permanece decisão humana posterior.

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

Integração controlada ainda deve ser registrada neste documento antes da consolidação final.
