# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.
- [Issue #318](https://github.com/mcpmieda/ecossistema-escola/issues/318) — integração da onda 15.

## Estado atual — onda 15

A onda 15 integrou as quatro frentes abertas pela #306 e compõe apenas o que já possui fronteira física segura:

- #314 / PR #321 — Audit Workspace HeroUI + `POST /api/gradebook/audit-workspace` local/preview;
- #315 / PR #323 — fonte física D1 de Desempenho em seis queries em lote, sem N+1 e sem semântica local de comparabilidade;
- #316 / PR #322 — materialização agregada e snapshots locais imutáveis/versionados de Boletins, com reimpressão sem recálculo;
- #317 / PR #320 — hardening do Operational Workspace com descarte de respostas obsoletas, troca de ano segura e paginação deduplicada;
- #318 / PR #324 — integração: Desempenho passa a estar composto internamente em `GradebookD1RuntimeV1.classPerformanceReadModel()`, sem HTTP/UI nesta onda.

Merges das frentes na `main` antes do PR de integração:

```text
#314 / #321  fd3fdc32d85227fa12a84477feaca0892e773816
#315 / #323  a101819daef4791e5a1f5a5a64b554ab97d59263
#316 / #322  2875749517ea0c145d73c3dc1df9aa11a8dc18a3
#317 / #320  d7f984e8753e5ad102f8aeb6a135f4870b8298e6
```

A autoridade acadêmica continua `imported-source`. Produção continua **fail-closed antes de `GRADEBOOK_D1`** e não possui banco D1 acadêmico remoto, binding, migration ou endpoint acadêmico funcional novo.

## Capacidades locais/preview

### F4 — Auditoria

- listas de lotes, ocorrências e reconciliações;
- filtros, cursor, detalhe e pendências;
- resolução CAS usando ator e instante exclusivamente server-side;
- HeroUI com estados `loading | ready | empty | unavailable | not-authorized`;
- um único bridge `POST /api/gradebook/audit-workspace`;
- promoção continua fora do workspace e exclusiva de `planImportReconciliation` + `executeImportChangePlan`.

### F5 — Operational Workspace

- Centrais de Aluno, Turma, Professor e Componente;
- ano explícito e pesquisa acadêmica autorizada;
- navegação `kind + id` opaca;
- um único bridge `POST /api/gradebook/operational-workspace`;
- abort/dedupe/descarte de resposta antiga, troca segura de ano e paginação sem duplicação.

### F6 — Desempenho

- `ClassPerformanceReadModelV1` e fonte D1 física compostos internamente no runtime;
- seis queries em lote por materialização; zero N+1 na matriz;
- quatro lentes preservadas;
- `recovery + result` usa `FinalRecoveryV1`; demais lentes recovery continuam trimestrais;
- anual sem projeção oficial em lente não-result continua `insufficient-data`;
- comparação solicitada continua `not-comparable` enquanto não existir resolvedor oficial;
- **ainda sem HTTP/UI** nesta onda.

### F8 — Boletins

- materialização individual e agregada por turma;
- snapshots provider-independent locais, profundamente imutáveis e versionados;
- reimpressão histórica sem recálculo nem leitura acadêmica atual;
- **ainda sem HTTP/UI/PDF/persistência remota**.

## Próxima onda — grandes passos

Foram pré-criadas três frentes grandes, verticalmente coerentes e paralelizáveis, mais uma integração. O estado da própria issue é a autoridade para saber se já foi liberada após deploy/smokes da #318:

- [#325 — Desempenho end-to-end local/preview](https://github.com/mcpmieda/ecossistema-escola/issues/325) — **Extra Alto**;
- [#326 — Boletins end-to-end local/preview](https://github.com/mcpmieda/ecossistema-escola/issues/326) — **Extra Alto**;
- [#327 — Conselho de Classe V1 sem regras novas](https://github.com/mcpmieda/ecossistema-escola/issues/327) — **Extra Alto**;
- [#328 — integração da próxima onda](https://github.com/mcpmieda/ecossistema-escola/issues/328) — **Extra Alto**, bloqueada pelas três frentes.

F9 transversal foi deliberadamente adiada: segurança, acessibilidade e recuperação já são testadas continuamente, mas uma frente F9 grande terá maior valor após F6/F7/F8 possuírem massa visível adicional. Não criar uma quarta frente artificial apenas para preencher a onda.

### PDF de Boletins

O repositório não possui renderer/biblioteca PDF integrada. A #326 deve incluir PDF no mesmo PR **somente** se isso não exigir decisão arquitetural/runtime nova; caso contrário, registra um único bloqueio explícito de renderização/PDF e entrega o restante da experiência sem fragmentar microissues.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes → próxima onda
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares.

## Objetivo

Construir um Banco de Notas funcional, modular, auditável e acessível a usuários leigos, integrado ao Centro de Administração e alimentado inicialmente pelas planilhas atuais dos professores. O sistema preserva a origem, implementa o motor nativo junto com o núcleo e publica progressivamente cada entrega independente.

## Em produção

- área `Banco de notas` no mesmo shell do Centro;
- interface HeroUI React v3;
- pesquisa global de navegação do Centro;
- importação local de até 50 arquivos por lote;
- leitura sequencial de XLSB, XLSX e XLS;
- reconhecimento de turmas, alunos, disciplinas, trimestres, quantitativo, qualitativo e recuperação;
- SHA-256 calculado no navegador;
- manifesto, progresso e diagnóstico por arquivo;
- processamento somente em memória no fluxo publicado;
- código dos workspaces pode existir no bundle, mas o runtime acadêmico de produção permanece fechado antes do binding.

A integração/deploy de código **não** significa ativação de dados acadêmicos em produção.

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
- Cloudflare D1 aprovado como armazenamento físico local/preview;
- portas independentes do fornecedor;
- migrations locais 0001–0003 e 21 tabelas;
- leitura/escrita local de contexto, entidades, fonte, lotes, registros, associações e Auditoria;
- planejamento idempotente de reimportação;
- promoção transacional com compare-and-set, savepoints e rollback;
- runtime local/preview explicitamente injetado;
- produção bloqueada antes de inspecionar o binding;
- capability `gradebook.persistence.admin` somente no servidor;
- autorização opaca emitida e validada no servidor;
- rotas acadêmicas autorizadas sempre `no-store`.

## Validação da fonte

A suíte sintética cobre D1/D2/D3, VG, trimestres, REC, estados especiais de célula, posições históricas, transferências, lotes de 1/20/50 arquivos, hash e falha isolada. O procedimento `REAL_DATA_VALIDATION.md` define a conferência privada do corpus real.

Essa execução ainda precisa ser registrada antes do fechamento definitivo da F1.

## Leitura obrigatória do agente

1. `AGENTS.md`;
2. [`COMECE_AQUI.md`](COMECE_AQUI.md);
3. [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml);
4. [`DECISIONS.md`](DECISIONS.md);
5. a issue atribuída;
6. [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTRACTS.md`](CONTRACTS.md), [`SOURCE_CONTRACT.md`](SOURCE_CONTRACT.md), [`D1_SCHEMA.md`](D1_SCHEMA.md), [`D1_RUNTIME.md`](D1_RUNTIME.md) e [`TEST_MATRIX.md`](TEST_MATRIX.md) conforme o escopo;
7. [`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md).

A issue deve ser executada diretamente. App Factory, Factory Runs, orquestradores e agentes auxiliares só podem ser usados quando a própria issue autorizar expressamente.

## Segurança

O repositório é público. Nunca usar dados reais de estudantes em fixtures, screenshots, logs, issues, PRs ou commits. Arquivos reais servem apenas para validação controlada fora do Git.