# Banco de Notas — ponto de entrada

Este diretório é a memória oficial do Banco de Notas. Para execução, prevalecem `AGENTS.md`, as decisões/documentos canônicos, a issue atual e os handoffs mais recentes.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual;
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano;
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências;
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina;
- [Issue #356](https://github.com/mcpmieda/ecossistema-escola/issues/356) — integração da onda 19.

## Estado atual — onda 19

A onda 19 fecha as lacunas reabertas de F4/F5 e entrega a parte executável de F6 sem inventar semântica acadêmica:

- #353 / PR #357 — revisão autoritativa F4: os sete requisitos vigentes estão cobertos pela implementação integrada; nenhuma taxonomia nova foi criada;
- #354 / PR #358 — cadastro/confirmação de Professor e atribuições anuais no bridge Operational existente, com ano explícito, CAS e IDs opacos;
- #355 / PR #359 — dois gráficos interativos sobre percentual oficial importado; comparação proporcional permanece `not-comparable` com hard stop `comparison-semantics-not-integrated`;
- #356 / PR #362 — composição transversal, testes, memória canônica e publicação.

A autoridade ativa continua **`imported-source`**. Produção acadêmica continua **fail-closed antes de `GRADEBOOK_D1`**: não existe D1 acadêmico remoto, binding, migration remota ou autoridade nativa ativa.

## Bridges acadêmicos

Existe exatamente um bridge por superfície:

- `POST /api/gradebook/operational-workspace`;
- `POST /api/gradebook/audit-workspace`;
- `POST /api/gradebook/performance`;
- `POST /api/gradebook/bulletins`;
- `POST /api/gradebook/reports`;
- `POST /api/gradebook/council-workspace`.

Todos preservam autorização server-side, `gradebook.persistence.admin` e `no-store`.

## Fases

### F4 — Reconciliação/Auditoria

A revisão da #353 confirmou cobertura integral dos sete bullets vigentes: identidade/idempotência, versões, `FOI PARA`/`ESTAVA NO`, promoção/rejeição, categorias abertas ponta a ponta, Audit Workspace e bloqueio de falso sucesso crítico. F4 pode encerrar após a publicação da #356.

### F5 — Contexto/Centrais

Além das quatro Centrais e pesquisa autorizada, a #354 entrega manutenção explícita de Professor e atribuições anuais. A experiência fica dentro da superfície Operational já lazy e só inicia requests quando o usuário abre a manutenção. F5 pode encerrar após a publicação da #356.

### F6 — Desempenho

As quatro lentes, paginação/drill-down e dois gráficos oficiais estão entregues. Os gráficos projetam somente `term-result.percentage.imported`, sem média, ranking, taxa ou agregação inventada.

**F6 permanece aberta**: não existe semântica canônica suficiente para escolher `basis`, `current`, `reference` ou tolerância da comparação proporcional. O único comportamento autorizado continua `not-comparable` / `comparison-semantics-not-integrated`.

### F7/F8

Conselho V2, decisões duráveis, Boletins/snapshots duráveis, PDF individual/batch bounded e Relatórios permanecem integrados conforme a onda 18.

## D1

Local/preview usa migrations 0001–0004 e 25 tabelas. A onda 19 não altera schema. Não existe migration remota, purge/retention inventada ou provisionamento de produção.

## Próximo grande passo — F9 readiness

- #360 — preparar readiness, rollback/recuperação, protocolo privado de piloto e ensaios sintéticos, **sem ativar produção**;
- #361 — integrar/publicar essa preparação e deixar o gate produtivo explicitamente manual.

A futura transição para `native-engine` continua separada na #347 e depende dos gates F9 e da decisão normativa correspondente; a onda 19 não a antecipa.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes → próxima frente grande
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita da issue. O repositório é público: nunca publicar dados reais de estudantes em fixtures, logs, issues, PRs ou commits.
