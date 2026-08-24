# VERIFICATION — Centro de Administração v0.5

## Escopo

Validação da candidata v0.5 do Centro de Administração. O bloco adiciona saúde operacional conservadora e torna os contratos semânticos da App Factory verificáveis no CI, preservando a candidata somente leitura e o `releaseState = validation`.

Nenhuma condição abaixo autoriza produção oficial.

## Baseline corrente

A v0.5 está integrada em:

`main@0e04f64e61619977d0f7579b0878cd8f400e727b`

PR #14: **merged**.

## Mudança funcional v0.5

Nova rota/área: `Operação`.

Capability declarada: `platform.health.read`.

O BFF continua usando o mesmo `/api/platform/snapshot`; nenhum endpoint paralelo de observabilidade foi criado.

### Fundação

O snapshot deriva a saúde estrutural da presença real das quatro listas obrigatórias. Se uma delas estiver ausente, o estado passa a `degraded` e `missingPlatformLists` informa a estrutura faltante.

Isso fecha o falso positivo anterior em que `foundation.status` era sempre `ok`.

### Auditoria

O snapshot conta como falha apenas resultados recentes explicitamente iniciados por classificadores de erro/falha.

Cobertura inclui:

- `ERRO` -> falha;
- `Falha: ...` -> falha;
- `failed_request` -> falha;
- `sucesso` -> não falha;
- `sem erro` -> não falha.

### HealthEndpoint

A candidata mede apenas cobertura do contrato:

- sistemas registrados com `HealthEndpoint` preenchido;
- sistemas sem contrato configurado.

Nenhum HealthEndpoint é executado pelo navegador ou pelo BFF. Configuração não é apresentada como prova de disponibilidade.

### Recuperação

`recoveryStatus = not-verified`.

A interface informa explicitamente que não existe no snapshot atual evidência de restore testado. A ausência dessa evidência não é mascarada como sucesso.

## Busca v0.4 preservada

`tests/platform-search.test.ts` continua protegendo:

- normalização de acentos/caixa;
- busca por termos fora de sequência;
- limite de resultados;
- índice restrito a áreas, sistemas registrados e metadados de configuração;
- exclusão de auditoria e migrações.

A área Operação é pesquisável porque integra o manifesto do núcleo.

## App Factory — gate semântico

Os artefatos atuais são:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

Critérios atualizados:

- `AC-010` — busca permission-scoped;
- `AC-011` — degradação, sinais operacionais, HealthEndpoint e recuperação não verificada.

`infra/validation/validate-semantic-contract.mjs` valida fingerprint SHA-256 canônico, sincronização entre contrato/assurance/plano, critérios e prioridades, evidência de critérios `must`, referências e cobertura semântica.

Fingerprint validado:

`67d5428e416ae83ddc42f6d8be36102b2c2716c26b09e353bccf2648309c9ec8`

`npm run semantic:check` integra `npm run verify` e o workflow normal de CI.

## Gates técnicos

### Verify preparatório

Workflow `32776244752`, job `97587861851`: **success**.

- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 11 arquivos de teste: **pass**;
- **75 testes**: **pass**;
- build: **pass**.

O formatter temporário foi removido antes do head final.

### CI definitivo do PR #14

Workflow `32776526342`: **success**.

- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- testes: **pass**;
- build: **pass**;
- actionlint: **pass**;
- zizmor pedantic: **pass**.

## Deploy e smoke externo

Workflow `32776751948`, job `97589445198`: **success**.

Em 2026-08-24T20:57:37Z, o teste executado fora do Cloudflare confirmou no domínio `https://admin.escolaieda.com`:

- bundle contém `Centro v0.5 em validação controlada`;
- bundle contém `Sem degradação observada no snapshot`;
- bundle contém `Recuperação e restore`;
- `/api/me` sem sessão = `401`;
- `/api/platform/snapshot` sem sessão = `401`.

Asset observado no smoke: `/assets/index-c_WUWUVv.js`.

PR temporário #15: fechado sem merge. Branch de smoke: resetada para `main`.

## Segurança e autorização preservadas

- Microsoft Entra ID: inalterado;
- BFF/cookie HttpOnly selado: inalterado;
- `/api/platform/snapshot`: sessão + `ADMINISTRADOR` server-side;
- `401` anônimo: preservado e confirmado externamente;
- `403` para perfil sem `ADMINISTRADOR`: preservado/testado;
- Graph/SharePoint: mesmos limites e fonte autoritativa;
- HealthEndpoint: não executado;
- nenhuma credencial ou permissão adicional foi adicionada.

## Privacidade

O teste do snapshot continua assegurando que o read model não expõe:

- `ValorJson`;
- `AtualizadoPorObjectId` desnecessário;
- `UsuarioObjectId`;
- `DetalhesJson`.

Os sinais operacionais são derivados de metadados já autorizados e não ampliam dados pessoais enviados ao navegador.

## Fronteira de escrita

A v0.5 não adiciona escrita.

Continuam sem mutação:

- Operação;
- Sistemas;
- Auditoria;
- Configurações;
- Publicações;
- Páginas.

Publicações e Páginas permanecem planejadas.

## Gate visual humano

Estado: **pending**.

A v0.5 já está disponível no domínio de validação para inspeção humana. A avaliação pode cobrir a nova área Operação, além de login, shell, busca, Sistemas, Auditoria, Configurações, mobile e logout.

## Estado do bloco v0.5

- higiene: **pass**;
- format/lint/typecheck/semantic/test/build: **pass**;
- actionlint/zizmor: **pass**;
- merge em main: **pass**;
- deploy Cloudflare: **pass confirmado externamente**;
- smoke externo específico da v0.5: **pass**;
- produção oficial: **bloqueada**.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
