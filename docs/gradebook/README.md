# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.
- [Issue #337](https://github.com/mcpmieda/ecossistema-escola/issues/337) — integração da onda 17.

## Estado atual — onda 17

A onda 17 combina o PDF canônico de Boletins com o primeiro hardening institucional grande do Banco de Notas:

- #335 / PR #338 — PDF oficial client-side sob demanda, sempre derivado de `BulletinSnapshotV1`, sem segundo motor acadêmico;
- #336 / PR #339 — lazy loading da rota e das cinco superfícies, isolamento de falhas, segurança/storage auditada e zero requests acadêmicos automáticos na entrada;
- #337 — composição final, navegação direta da busca para cada área, testes combinados e atualização da memória canônica.

A autoridade acadêmica continua `imported-source`. Produção permanece **fail-closed antes de `GRADEBOOK_D1`**. Não existe banco acadêmico remoto, binding, migration, secret ou recurso remoto novo decorrente desta onda.

## Bridges acadêmicos

A composição central mantém exatamente um bridge de cada superfície:

- `POST /api/gradebook/operational-workspace`;
- `POST /api/gradebook/audit-workspace`;
- `POST /api/gradebook/performance`;
- `POST /api/gradebook/bulletins`;
- `POST /api/gradebook/council-workspace`.

Todos usam autorização efetiva server-side, a capability existente `gradebook.persistence.admin` e respostas `no-store`. Claims de papel, capability, ator ou instante vindos do navegador não constituem autoridade.

## Shell e hardening F9

O Banco de Notas deixou de montar todas as experiências na entrada:

- a própria rota do Banco é lazy;
- Importação, Centrais, Auditoria, Desempenho, Boletins e Conselho possuem navegação compacta por áreas;
- Operational, Audit, Performance, Boletins e Conselho são chunks lazy independentes;
- entrar no Banco dispara **zero requests acadêmicos automáticos**; cada superfície inicia seu contexto apenas quando ativada;
- uma falha de chunk/superfície fica isolada e não derruba o Centro nem outra área do Banco;
- áreas inativas ficam fora do foco/a11y, mas uma área visitada pode preservar estado React efêmero;
- a busca global pode abrir diretamente uma área por `#/banco-de-notas?area=<id>` sem criar nova rota ou bridge;
- `localStorage`, `sessionStorage`, IndexedDB, Cache API e service-worker/cache não são usados para persistir dados acadêmicos.

Baseline pós-#328: 820,68 kB minificados / 235,71 kB gzip de JS inicial. Na composição #335+#336, o entry ficou em 552,28 kB / 167,15 kB gzip; contabilizando conservadoramente o chunk `alert` usado pelo shell, o caminho inicial efetivo é 661,25 kB / 202,82 kB gzip. O renderer PDF permanece separado em aproximadamente 9,71 kB / 3,81 kB gzip. O warning Vite de chunk acima de 500 kB ainda existe e é tratado como limitação mensurada, não como gate arbitrário.

## Capacidades locais/preview

### F4 — Auditoria

- lotes, ocorrências, reconciliações, detalhe e pendências;
- resolução CAS com ator e instante server-side;
- HeroUI acessível e responsiva;
- um único bridge Audit Workspace.

### F5 — Operational Workspace

- Centrais de Aluno, Turma, Professor e Componente;
- ano explícito, pesquisa acadêmica autorizada e navegação `kind + id` opaca;
- abort/dedupe/descarte de resposta obsoleta e paginação resiliente;
- um único bridge Operational Workspace.

### F6 — Desempenho

- quatro lentes: Resultado, Quantitativo, Qualitativo e Avaliações;
- modos regular e recovery;
- paginação independente de linhas e colunas;
- detalhe de aluno/célula sob demanda;
- cancelamento, dedupe e stale-response discard;
- raw source evidence não atravessa HTTP;
- `recovery + result` usa `FinalRecoveryV1`; demais lentes recovery permanecem trimestrais;
- anual sem projeção oficial em lente não-result permanece `insufficient-data`;
- comparação continua fail-closed como `not-comparable` enquanto não existir semântica oficial integrada.

### F7 — Conselho de Classe V1

- fila em lote e aluno em foco;
- classificação 0/1/2/3+/insuficiente fornecida pela projeção oficial upstream da #332;
- T1/T2/T3 projetados de `TermResultV1` importado;
- REC projetada apenas de `FinalRecoveryV1.recoveryGrade.imported` quando aplicável e unívoca;
- REC ausente vira `not-applicable`; REC ambígua vira `insufficient-data`;
- Council Workspace não chama `resolveNativeAnnualOutcome` e não recalcula elegibilidade;
- decisão humana separada do cálculo, justificativa obrigatória, histórico append-only e CAS;
- decisão formal coerente já registrada impede uma segunda decisão;
- nenhuma votação/desempate/frequência/participante adicional foi introduzida na V1.

O store de decisão ainda é process-local/preview e descartável; durabilidade cross-restart não é declarada.

### F8 — Boletins

- três modelos canônicos sobre `BulletinModelV1`;
- preview e emissão usam a mesma materialização;
- emissão individual e lote acadêmico agregado, com isolamento de aluno bloqueado;
- snapshots locais append-only, versionados e profundamente imutáveis;
- histórico e reimpressão exclusivamente do snapshot, sem leitura acadêmica atual;
- PDF oficial aceita somente `BulletinPdfInputV1`/`BulletinSnapshotV1`;
- renderer client-side P&B/raster, carregado por `import()` apenas ao pedir PDF;
- emissão oficial segue `snapshot → PDF`; reimpressão usa o snapshot histórico e não cria nova versão;
- Blob URLs são temporárias e revogadas; não há storage acadêmico persistente no navegador;
- PDF em lote não é disparado nesta versão: o arquivo é gerado por snapshot individual;
- armazenamento de snapshots continua local/preview descartável.

## F1 — fonte e importação

F1 está **definitivamente concluída — 7/7**. A #184 foi fechada como `completed` após validação privada controlada e smoke autenticado completos. O registro sanitizado confirma:

- protocolo real aplicável aprovado;
- smoke de hash/manifesto/progresso/diagnóstico e falha isolada aprovado;
- arquivos reais modificados: 0;
- dados identificáveis publicados: 0;
- divergências funcionais bloqueantes: 0;
- gates históricos reais antigos restantes: 0.

Isso não remove políticas gerais de privacidade, segurança ou futuros gates próprios de ativação de produção.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes → próxima onda
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita da issue.

## Núcleo integrado

### Motor nativo

- semântica das células;
- arredondamento acadêmico;
- composição trimestral 30/30/40 e 45%/55%;
- recuperação paralela;
- resultado trimestral e percentual;
- recuperação final;
- resultado anual, aprovação direta/pós-REC e elegibilidade básica;
- equivalência anual `match | expected-difference | mismatch | not-comparable`.

A autoridade continua `imported-source`. O motor permanece separável e comparável; não assume a nota oficial silenciosamente.

### Contexto acadêmico e persistência

- uma única composição oficial de 2026, sem seleção por relógio;
- Cloudflare D1 aprovado apenas como armazenamento físico local/preview no estado atual;
- portas independentes do fornecedor;
- migrations locais 0001–0003 e 21 tabelas; a onda 17 não cria migration/schema;
- leitura/escrita local de contexto, entidades, fonte, lotes, registros, associações e Auditoria;
- planejamento idempotente de reimportação e promoção transacional com CAS/rollback;
- runtime local/preview explicitamente injetado;
- produção bloqueada antes de inspecionar o binding;
- rotas acadêmicas autorizadas sempre `no-store`.

## Em produção

O shell do Centro e o importador em memória permanecem publicados. A presença das superfícies e do renderer PDF no código **não** ativa dados acadêmicos em produção: runtimes acadêmicos permanecem fail-closed até autorização própria de produção e um binding explicitamente aprovado.

## Leitura obrigatória do agente

1. `AGENTS.md`;
2. [`COMECE_AQUI.md`](COMECE_AQUI.md);
3. [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml);
4. [`DECISIONS.md`](DECISIONS.md);
5. a issue atribuída;
6. [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTRACTS.md`](CONTRACTS.md), [`SOURCE_CONTRACT.md`](SOURCE_CONTRACT.md), [`D1_SCHEMA.md`](D1_SCHEMA.md), [`D1_RUNTIME.md`](D1_RUNTIME.md) e [`TEST_MATRIX.md`](TEST_MATRIX.md) conforme o escopo;
7. [`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md).

## Segurança

O repositório é público. Nunca usar dados reais de estudantes em fixtures, screenshots, logs, issues, PRs ou commits. Arquivos reais servem apenas para validação controlada fora do Git. Nenhuma ativação acadêmica de produção pode ser inferida de um merge de código.
