# VERIFICATION — Centro de Administração v0.5

## Escopo

Validação da candidata v0.5 do Centro de Administração. O bloco adiciona saúde operacional conservadora e torna os contratos semânticos da App Factory verificáveis no CI, preservando a candidata somente leitura e o `releaseState = validation`.

Nenhuma condição abaixo autoriza produção oficial.

## Baseline publicado

A v0.4 está integrada em `main@0c6bbee725e64aae0e5602ba07f817b3626c2684`.

Smoke externo `32771055987`: **pass**.

Evidência no domínio `https://admin.escolaieda.com`:

- bundle servido continha `Centro v0.4 em validação controlada`;
- bundle servido continha `Buscar no Centro`;
- `/api/me` sem sessão retornou `401`;
- `/api/platform/snapshot` sem sessão retornou `401`.

## Mudança funcional v0.5

Nova rota/área: `Operação`.

Capability declarada: `platform.health.read`.

O BFF continua usando o mesmo `/api/platform/snapshot`; nenhum endpoint paralelo de observabilidade foi criado.

### Fundação

O snapshot agora deriva a saúde estrutural da presença real das quatro listas obrigatórias. Se uma delas estiver ausente, o estado deixa de ser `ok` e passa a `degraded`, com a lista ausente explicitada em `missingPlatformLists`.

Isso fecha o falso positivo anterior em que `foundation.status` era sempre `ok`.

### Auditoria

O snapshot conta como falha apenas resultados recentes explicitamente iniciados por classificadores de erro/falha.

Cobertura de teste inclui:

- `ERRO` -> falha;
- `Falha: ...` -> falha;
- `failed_request` -> falha;
- `sucesso` -> não falha;
- `sem erro` -> não falha.

### HealthEndpoint

A candidata mede apenas **cobertura do contrato**:

- quantos sistemas registrados possuem `HealthEndpoint` preenchido;
- quantos ainda não possuem.

Nenhum HealthEndpoint é executado pelo navegador ou pelo BFF. Portanto, configuração não é apresentada como prova de disponibilidade.

### Recuperação

`recoveryStatus = not-verified` nesta candidata.

A interface informa explicitamente que não existe no snapshot atual evidência de restore testado. A ausência dessa evidência não é mascarada como sucesso.

## Busca v0.4 preservada

`tests/platform-search.test.ts` continua protegendo:

- normalização de acentos/caixa;
- busca por termos fora de sequência;
- limite de resultados;
- índice restrito a áreas, sistemas registrados e metadados de configuração;
- exclusão de auditoria e migrações.

A área Operação passa a ser pesquisável porque é uma área declarada no manifesto do núcleo.

## App Factory — gate semântico

Os três artefatos semânticos foram atualizados para o estado real do Centro:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

Critérios adicionados/regularizados:

- `AC-010` — busca permission-scoped;
- `AC-011` — degradação, sinais operacionais, HealthEndpoint e recuperação não verificada.

O novo script `infra/validation/validate-semantic-contract.mjs` usa fingerprint SHA-256 sobre JSON canônico com chaves ordenadas e valida:

- contrato, assurance e plano na mesma versão;
- fingerprints atuais;
- IDs de critérios;
- prioridades;
- evidência em critérios `must`;
- referências a invariantes/conceitos;
- cobertura dos critérios obrigatórios pelo assurance.

Fingerprint validado:

`67d5428e416ae83ddc42f6d8be36102b2c2716c26b09e353bccf2648309c9ec8`

`npm run semantic:check` foi incorporado a `npm run verify` e ao workflow normal de CI.

## Evidência técnica v0.5

Workflow temporário de formatação `32776244752`, job `97587861851`: **success**.

Depois da formatação, `npm run verify` passou integralmente:

- `format:check`: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 11 arquivos de teste: **pass**;
- **75 testes**: **pass**;
- build Vite: **pass**.

O workflow temporário foi removido antes do head final.

O primeiro CI do PR #14 já havia confirmado actionlint + zizmor: **pass**. O CI normal do head definitivo, sem workflow temporário e contendo a documentação atualizada, é o gate final antes do merge.

## Segurança e autorização preservadas

- Microsoft Entra ID: inalterado;
- BFF/cookie HttpOnly selado: inalterado;
- `/api/platform/snapshot`: sessão + `ADMINISTRADOR` server-side;
- `401` anônimo: preservado;
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

Os novos sinais operacionais são derivados de metadados já autorizados e não ampliam dados pessoais enviados ao navegador.

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

Após o merge, a v0.5 deve ser publicada no domínio restrito e confirmada externamente. A inspeção humana pode então cobrir também a nova área Operação, além de login, shell, busca, Sistemas, Auditoria, Configurações, mobile e logout.

## Critério para encerrar o bloco v0.5

- higiene/formatter temporário removido: **pass**;
- format/lint/typecheck/semantic/test/build: **pass no verify preparatório**;
- actionlint/zizmor: **pass no primeiro CI**;
- CI normal do head final: **pendente**;
- merge em main: **pendente**;
- deploy Cloudflare da main: **pendente**;
- smoke externo específico da v0.5: **pendente**;
- produção oficial: **bloqueada**.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
