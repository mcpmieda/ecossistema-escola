# Banco de Notas — ponto de entrada

Este diretório é a memória oficial do Banco de Notas. Para execução, prevalecem `AGENTS.md`, estas decisões/documentos, a issue atual e os handoffs mais recentes.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual;
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano;
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências;
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina;
- [Issue #343](https://github.com/mcpmieda/ecossistema-escola/issues/343) — integração da onda 18.

## Estado atual — onda 18

A onda 18 integra três frentes grandes:

- #340 / PR #351 — durabilidade D1 local/preview de snapshots de Boletins e decisões de Conselho, com migration 0004, append-only e CAS;
- #341 / PR #345 — Conselho V2 institucional: revisão, fechamento explícito, fotografia/histórico imutável e votação numérica opcional sem desempate inventado;
- #342 / PR #346 — Relatórios institucionais sobre dados oficiais e artefatos PDF em lote bounded/sequenciais;
- #343 / PR #352 — composição central dos providers, Council V2/Reports no shell, bridges, testes e memória canônica.

A autoridade acadêmica ativa continua `imported-source`. Produção permanece **fail-closed antes de `GRADEBOOK_D1`**. A onda 18 não provisiona D1 de produção, não aplica migration remota, não cria secret/binding remoto e não ativa `native-engine`.

## Bridges acadêmicos

A composição central mantém exatamente um bridge de cada superfície:

- `POST /api/gradebook/operational-workspace`;
- `POST /api/gradebook/audit-workspace`;
- `POST /api/gradebook/performance`;
- `POST /api/gradebook/bulletins`;
- `POST /api/gradebook/reports`;
- `POST /api/gradebook/council-workspace`.

Todos usam autorização efetiva server-side, a capability existente `gradebook.persistence.admin` e respostas `no-store`. Claims de papel, capability, ator ou instante vindos do navegador não constituem autoridade.

## Shell e segurança

- a rota do Banco é lazy;
- Importação, Centrais, Auditoria, Desempenho, Boletins, Relatórios e Conselho possuem navegação compacta por áreas;
- superfícies pesadas são carregadas apenas quando ativadas;
- entrar no Banco dispara zero requests acadêmicos automáticos;
- falhas de chunk/superfície ficam isoladas;
- áreas inativas ficam fora do foco/a11y;
- busca global abre diretamente `#/banco-de-notas?area=<id>`;
- `localStorage`, `sessionStorage`, IndexedDB, Cache API e service-worker/cache não armazenam dados acadêmicos.

## Capacidades locais/preview

### F4 — Auditoria

- lotes, ocorrências, reconciliações, detalhe e pendências;
- resolução CAS com ator/instante server-side;
- HeroUI acessível e responsiva;
- um único bridge Audit Workspace.

F4 permanece aberta para a revisão autoritativa bullet-a-bullet prevista na #353.

### F5 — Operational Workspace

- Centrais de Aluno, Turma, Professor e Componente;
- ano explícito, pesquisa acadêmica autorizada e navegação `kind + id` opaca;
- abort/dedupe/descarte de resposta obsoleta e paginação resiliente.

O cadastro/confirmação de Professor e atribuições anuais permanece para #354.

### F6 — Desempenho

- quatro lentes: Resultado, Quantitativo, Qualitativo e Avaliações;
- modos regular e recovery;
- paginação independente de linhas/colunas e drill-down;
- raw source evidence não atravessa HTTP;
- comparação continua fail-closed como `not-comparable` enquanto a semântica oficial não estiver integrada.

Comparabilidade proporcional e gráficos úteis, sem métrica inventada, ficam agrupados na #355.

### F7 — Conselho de Classe V2

- fila e visão anual continuam usando exclusivamente a projeção oficial #332;
- Council Workspace não recalcula elegibilidade;
- decisões humanas são duráveis em D1 local/preview, append-only e com CAS;
- fechamento explícito da turma usa revisão prévia e fotografia/histórico imutável;
- novas decisões/contagens ficam bloqueadas após fechamento;
- votação numérica permanece opcional e não fabrica decisão;
- empate nunca é resolvido automaticamente; sem identidade/capability oficial de diretor, desempate permanece fail-closed;
- a sessão/reunião V2 permanece provider-independent e process-local/preview nesta versão; a 0004 não inventa tabela para esse estado.

### F8 — Boletins e Relatórios

- três modelos canônicos sobre `BulletinModelV1`;
- preview e emissão usam a mesma materialização;
- snapshots e histórico são duráveis em D1 local/preview;
- reimpressão usa exclusivamente snapshot histórico e faz zero leitura acadêmica atual;
- PDF individual oficial é derivado apenas de `BulletinSnapshotV1`, client-side/lazy;
- PDF em lote é bounded e sequencial: até 3 documentos, 72 páginas totais e uma geração concorrente;
- reprint em lote aceita exclusivamente snapshots históricos;
- Relatórios cobre resultados/aproveitamento oficial, composição, recuperação, Conselho e Auditoria;
- qualquer taxa, média, ranking ou indicador sem semântica oficial permanece fail-closed.

## F1 — fonte e importação

F1 está **definitivamente concluída — 7/7**. A #184 foi fechada como `completed` após validação privada controlada e smoke autenticado completos. Nenhum arquivo real foi modificado, nenhum dado identificável foi publicado e nenhum gate histórico real antigo permanece pendente.

## Motor nativo e autoridade

O motor nativo V1 está implementado e testado: semântica das células, arredondamento, composição trimestral, recuperação, resultado trimestral/anual, elegibilidade básica e equivalência fonte × motor.

A autoridade ativa continua `imported-source`. A decisão institucional de destino para `native-engine` está separada da onda 18 e será executada somente pela #347/F9, com piloto, reconciliação, rollback, vigência explícita e sem reinterpretação silenciosa do histórico.

## Contexto acadêmico e persistência

- composição oficial 2026, sem seleção por relógio;
- Cloudflare D1 é o armazenamento físico local/preview aprovado;
- domínio conhece portas provider-independent, não D1 diretamente;
- migrations locais 0001–0004 e 25 tabelas;
- 0004 adiciona somente streams/versions de snapshots de Boletins e decisões do Conselho;
- leitura/escrita local de contexto, entidades, fonte, lotes, registros, associações e Auditoria;
- planejamento idempotente e promoção transacional com CAS/rollback;
- runtime local/preview explicitamente injetado;
- produção bloqueada antes de inspecionar o binding;
- nenhuma política de retenção/purge foi inventada.

## Próxima onda — 19

Depois da integração #343:

- #353 — fechamento integral F4 Reconciliação/Auditoria;
- #354 — cadastro/confirmação de Professor e atribuições anuais para fechar F5;
- #355 — comparabilidade oficial + poucos gráficos úteis para fechar F6;
- #356 — integração da onda 19.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes → próxima onda
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita da issue.

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
