# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.
- [Issue #328](https://github.com/mcpmieda/ecossistema-escola/issues/328) — integração da onda 16.

## Estado atual — onda 16 integrada

A onda 16 levou Desempenho, Boletins e Conselho de Classe até experiências end-to-end local/preview, sem ativar persistência acadêmica em produção:

- #325 / PR #329 — Performance Transport V1, `POST /api/gradebook/performance` e `PerformancePage`;
- #326 / PR #331 — Boletins com seleção, preview, emissão individual/lote, snapshots, histórico e reimpressão por `POST /api/gradebook/bulletins`;
- #327 / PR #330 — Council Workspace/Decision V1, decisão humana, histórico/CAS e HeroUI;
- #332 / PR #333 — projeção anual oficial upstream do Conselho, materializada sem nova regra e sem schema;
- #328 — wiring central das três superfícies, runtime do Conselho e sincronização canônica.

A autoridade acadêmica continua `imported-source`. Produção permanece **fail-closed antes de `GRADEBOOK_D1`**. Não existe banco acadêmico remoto, binding, migration, secret ou recurso remoto novo decorrente desta onda.

## Bridges acadêmicos

A composição central mantém exatamente um bridge de cada superfície:

- `POST /api/gradebook/operational-workspace`;
- `POST /api/gradebook/audit-workspace`;
- `POST /api/gradebook/performance`;
- `POST /api/gradebook/bulletins`;
- `POST /api/gradebook/council-workspace`.

Todos os bridges acadêmicos usam autorização efetiva server-side, a capability existente `gradebook.persistence.admin` e respostas `no-store`. Claims de papel, capability, ator ou instante vindos do navegador não constituem autoridade.

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
- nenhum voto, desempate, frequência, participante ou exceção foi inventado.

O store de decisão é process-local/preview e descartável; durabilidade cross-restart não é declarada.

### F8 — Boletins

- três modelos canônicos sobre `BulletinModelV1`;
- preview e emissão usam a mesma materialização;
- emissão individual e lote agregado, com isolamento de aluno bloqueado;
- snapshots locais append-only, versionados e profundamente imutáveis;
- histórico e reimpressão exclusivamente do snapshot, sem leitura acadêmica atual;
- armazenamento local/preview descartável.

**Bloqueio pós-onda:** `PDF/renderização pendente por decisão arquitetural`. A #328 não escolhe biblioteca, renderer, worker, fontes ou storage para PDF.

## F1 — fonte e importação

F1 está **definitivamente concluída — 7/7**. A #184 foi fechada como `completed` após validação privada controlada e smoke autenticado completos. O registro sanitizado confirma:

- protocolo real aplicável aprovado;
- smoke de hash/manifesto/progresso/diagnóstico e falha isolada aprovado;
- arquivos reais modificados: 0;
- dados identificáveis publicados: 0;
- divergências funcionais bloqueantes: 0;
- gates históricos reais antigos restantes: 0.

Os gates históricos de validação real controlada e smoke completo foram satisfeitos e deixaram de ser pendências. Isso não remove as políticas gerais de privacidade, segurança ou futuros gates próprios de ativação de produção.

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
- migrations locais 0001–0003 e 21 tabelas, sem migration nova nesta onda;
- leitura/escrita local de contexto, entidades, fonte, lotes, registros, associações e Auditoria;
- planejamento idempotente de reimportação e promoção transacional com CAS/rollback;
- runtime local/preview explicitamente injetado;
- produção bloqueada antes de inspecionar o binding;
- rotas acadêmicas autorizadas sempre `no-store`.

## Em produção

O shell do Centro e o importador em memória permanecem publicados. A presença das páginas de Desempenho, Boletins e Conselho no bundle **não** ativa dados acadêmicos em produção: seus runtimes permanecem fail-closed até uma autorização própria de produção e um binding explicitamente aprovado.

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
