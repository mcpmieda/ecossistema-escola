# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.
- [Sessão temporária #273](https://github.com/mcpmieda/ecossistema-escola/issues/273) — execução serial opcional pelo Codex 5.6 High.

## Estado atual

Onze ondas foram integradas. A décima primeira entregou:

- #278/PR #283 — read model local da Central do Aluno;
- #279/PR #284 — read model local da Central da Turma;
- #280/PR #285 — read models locais das Centrais do Professor e do Componente;
- #281 — fachada operacional única sobre a `PersistenceUnitOfWorkV1` e runtime local/preview.

Merges funcionais:

```text
#278  1e79af0977501ac2bfc03b61808856902f983c0a
#279  5483fe566f568ed5e869410187b7eb3b95ae67fc
#280  3dd300f8aa45225772b7133dfe9a4968d9438271
```

A produção continua sem D1 acadêmico provisionado, binding remoto ou migration remota. Nenhuma nova tela ou persistência oficial foi ativada.

## Décima segunda onda

- [#286 — contrato da pesquisa global acadêmica autorizada](https://github.com/mcpmieda/ecossistema-escola/issues/286) — **Pro**;
- [#287 — read model local da pesquisa acadêmica](https://github.com/mcpmieda/ecossistema-escola/issues/287) — **Codex**, bloqueada por #286;
- [#288 — integração da décima segunda onda](https://github.com/mcpmieda/ecossistema-escola/issues/288) — **Pro**, bloqueada por #286 e #287.

A fila inicia pela #286 porque pesquisa e autorização exigem contrato próprio. A #287 não pode começar
antes desse merge e de autorização explícita na #273. Nenhuma tarefa cria UI, endpoint ou acesso remoto.

## Sessão temporária serial

A #273 não substitui issues, branches, PRs, testes, integração ou deploy. Ela permite que uma única
sessão do Codex 5.6 High execute apenas a fila explicitamente autorizada. Depois da #281 não existe
nova issue Codex liberada:

```text
#286 (Pro) → #287 (Codex bloqueada) → #288 (Pro bloqueada)
```

Cada implementação continua com branch e PR próprios; os merges permanecem reservados à issue de integração. `PAUSAR`, `PARAR`, `RETOMAR` e `ENCERRAR MODO AUTÔNOMO` controlam a sessão. Hard stops impedem recursos remotos, dados reais, mudança de autoridade, migrations destrutivas ou decisões humanas não documentadas.

## Objetivo

Construir um Banco de Notas funcional, modular, auditável e acessível a usuários leigos, integrado ao Centro de Administração e alimentado inicialmente pelas planilhas atuais dos professores. O sistema preserva a origem, implementa o motor nativo junto com o núcleo e publica progressivamente cada entrega independente.

## Em produção

- área `Banco de notas` no mesmo shell do Centro;
- interface HeroUI React v3;
- pesquisa global integrada;
- importação local de até 50 arquivos por lote;
- leitura sequencial de XLSB, XLSX e XLS;
- reconhecimento de turmas, alunos, disciplinas, trimestres, quantitativo, qualitativo e recuperação;
- SHA-256 calculado no navegador;
- manifesto, progresso e diagnóstico por arquivo;
- processamento somente em memória, sem persistência acadêmica.

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

### Contexto acadêmico

Existe uma única composição oficial de 2026. Ela referencia diretamente os perfis nativos integrados, não escolhe ano pelo relógio e falha para contexto ausente, duplicado, inativo ou incompatível.

### Persistência e reconciliação

- Cloudflare D1 aprovado como armazenamento físico;
- portas independentes do fornecedor;
- migrations locais 0001–0003 e 21 tabelas;
- leitura/escrita local completa de ano, entidades, fonte, lotes, registros, associações e Auditoria;
- planejamento idempotente de reimportação;
- promoção transacional com compare-and-set, savepoints e rollback;
- runtime local/preview explicitamente injetado;
- produção bloqueada antes de inspecionar o binding;
- capability `gradebook.persistence.admin` somente no servidor;
- rotas administrativas autenticadas, autorizadas e `no-store`;
- runner idempotente que consome o catálogo canônico das migrations;
- uma única composição local da `PersistenceUnitOfWorkV1`, com histórico paginado para todas as portas versionadas.

Os quatro read models operacionais e sua fachada única estão integrados localmente. Ainda faltam o
contrato/pesquisa global autorizada, a ligação posterior à interface e autorização explícita para
qualquer recurso remoto.

## Validação da fonte

A suíte sintética cobre D1/D2/D3, VG, trimestres, REC, estados especiais de célula, posições históricas, transferências, lotes de 1/20/50 arquivos, hash e falha isolada. O procedimento `REAL_DATA_VALIDATION.md` define a conferência privada do corpus real.

Essa execução ainda precisa ser registrada antes do fechamento definitivo da F1.

## Saúde e limites

A #220 registra a futura área global `Centro de Administração → Configurações → Saúde e limites`. Ela permanece planejada até existirem binding/uso real de D1 e backend autorizado de métricas.

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
