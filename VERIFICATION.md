# VERIFICATION — Centro de Administração v0.7

## Escopo

Validação da candidata v0.7 do Centro de Administração. O bloco cria o contrato versionado de integração modular e separa inventário operacional de integração efetivamente reconhecida pela plataforma.

Release state: `validation`. Nenhuma evidência abaixo autoriza produção oficial.

Por decisão de produto de 24/08/2026, estes itens ficam fora do fechamento desta fase e serão retomados posteriormente:

- integração funcional do primeiro sistema independente;
- construção de Publicações;
- construção de Páginas.

## Baseline anterior

Baseline publicada e externamente verificada antes da v0.7:

`main@d0c32d32844ec56037ddb46d7f93a386efc83aa5`

Runtime v0.6 correspondente:

`main@8632ae8eb420d2d2c2bd3c21ba33a53b8aea3d7a`

Domínio de validação:

`https://admin.escolaieda.com`

## Contrato de integração v0.7

### Fonte de verdade

`server/modules/contracts.ts` é a fonte versionada do contrato que a plataforma conhece e pode integrar.

`PLATAFORMA_MODULOS` no SharePoint continua sendo inventário operacional e não substitui o contrato.

Um registro existente no SharePoint não recebe estado `ready` apenas por existir.

### Campos obrigatórios

O manifesto exige:

- `contractVersion`;
- `key`;
- `name`;
- `baseRoute` same-origin;
- `version` semântica;
- `status`;
- `order`;
- `requiredCapabilities` sem duplicidade;
- `healthEndpoint` same-origin sob `/api/`.

Rotas relativas, protocol-relative (`//host`) e com barra invertida são rejeitadas.

### Estados de integração

`server/modules/registry.ts` resolve cada item como:

- `ready`;
- `registry-only`;
- `contract-mismatch`;
- `disabled`;
- `deprecated`;
- `invalid-registry`.

`available` só pode ser verdadeiro quando o estado é `ready` e todas as `requiredCapabilities` estão presentes na sessão.

### Legacy `RolesJson`

A v0.7 remove `RolesJson` do caminho de decisão:

- o BFF não solicita o campo na leitura Graph de `PLATAFORMA_MODULOS`;
- o resolvedor não o usa;
- o read model cliente não expõe `roles`;
- a busca não o indexa;
- sua presença em um item legado não concede autorização nem integração.

O campo físico pode permanecer temporariamente na lista SharePoint existente porque removê-lo não é requisito deste bloco e criaria migração desnecessária. A condição de remoção é uma futura manutenção da estrutura SharePoint em que nenhum consumidor legado dependa dele.

## Snapshot e interface

O snapshot passa a identificar módulos registrados com:

- `contractVersion`;
- `requiredCapabilities`;
- `integrationState`;
- `integrationIssues`;
- `available`.

A versão do snapshot é `0.7.0-validation`.

A área `Sistemas` mostra o estado de integração e as capabilities exigidas, mas não oferece abertura de sistema independente nesta fase.

A busca continua permission-scoped e usa o novo estado/capabilities do read model.

## App Factory — Semantic Assurance

Novos elementos obrigatórios:

- `INV-011` — registro operacional não equivale a autorização nem integração;
- `AC-013` — disponibilidade modular exige contrato versionado compatível e capabilities suficientes.

Fingerprint realmente calculado e validado pelo CI:

`7c0175727cc706f64575b885750cbe264c558f0f05fd883a111e8425595bcf73`

O valor acima substitui qualquer fingerprint intermediário calculado manualmente durante o desenvolvimento.

## Testes v0.7

A suíte cobre, entre outros comportamentos:

- contrato da `plataforma-base` válido e versionado;
- chaves de contratos integrados únicas;
- rejeição de rotas inseguras;
- rejeição de capabilities duplicadas;
- health endpoint fora de `/api/` rejeitado;
- registro compatível marcado `ready`;
- contrato correto sem capability continua indisponível;
- `RolesJson` legado ignorado;
- módulo sem manifesto marcado `registry-only`;
- divergência de versão marcada `contract-mismatch`;
- estados disabled/deprecated/unknown fail closed;
- ordenação determinística do registro;
- snapshot sem exposição de campos protegidos;
- busca sem retornar auditoria/migrações e sem depender de roles legadas.

## Higiene do repair loop

O desenvolvimento inicial ocorreu no PR #22, que também continha um formatter temporário.

O formatter foi endurecido antes de uso:

- checkout com `persist-credentials: false`;
- permissões default somente leitura;
- escrita limitada ao job temporário;
- push explícito com token do job.

Esse laboratório encontrou e permitiu corrigir uma falha real de typecheck nos testes: a possibilidade de o resolvedor retornar lista vazia não estava explicitamente provada antes de acessar o primeiro item.

Após a correção, o workflow temporário executou `npm run verify` com sucesso.

O PR #22 foi então fechado **sem merge**.

A candidata final foi reconstruída a partir da `main` em:

`feat/centro-admin-v0.7-module-integration-contract-clean`

Head funcional inicial:

`2d1089d6b256e836e76d083b7d581063df5d7834`

Comparação com a baseline:

- 1 commit funcional;
- 15 arquivos definitivos;
- zero mudanças em `.github/workflows`;
- nenhum artefato de formatter presente na candidata final.

## CI limpo da candidata

PR #23, workflow `32785823534`: **success**.

Job de aplicação `97617431317`:

- `npm ci`: **pass**;
- npm audit do install: **0 vulnerabilidades**;
- `format:check`: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 13 arquivos de teste: **pass**;
- **98 testes**: **pass**;
- build Vite: **pass**.

Job de segurança `97617431494`:

- actionlint: **pass**;
- zizmor pedantic: **pass**.

Build observado:

- Vite `8.2.2`;
- 1926 módulos transformados;
- CSS `index-Cy_yw-W_.css` — 66.43 kB, gzip 12.03 kB;
- JS `index-DDWNlGO3.js` — 316.75 kB, gzip 96.74 kB.

Deploy foi corretamente ignorado nesse workflow porque se tratava de PR.

## Fundação preservada

A v0.7 não altera:

- Entra ID;
- grupos institucionais;
- política cargo → grupos;
- `rolesForGroups`;
- formato/segredo do cookie de sessão;
- fluxo OIDC;
- Graph ou seus privilégios;
- SharePoint `CENTROADMIN`;
- Cloudflare Pages;
- CI/CD permanente;
- rotação automática da identidade técnica;
- logout corrigido;
- fronteira somente leitura do Centro.

Não houve migração SharePoint nem escrita de dados institucionais neste bloco.

## Estado antes do merge

No momento desta documentação:

- implementação: **pass**;
- higiene da candidata: **pass**;
- format/lint/typecheck/semantic/test/build: **pass**;
- 98 testes: **pass**;
- actionlint/zizmor: **pass**;
- merge em `main`: **pendente**;
- deploy v0.7: **pendente**;
- smoke externo v0.7: **pendente**;
- browser QA final da fase: **pendente**;
- recovery/restore com evidência: **pendente**;
- produção oficial: **bloqueada**.

## Próximo gate

Depois deste documento, o head definitivo deve passar novamente pelo CI normal. Se permanecer verde, o PR #23 pode ser integrado em `main`, publicado no domínio de validação e submetido a smoke externo específico da v0.7.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
