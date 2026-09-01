# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.
- [Sessão temporária #273](https://github.com/mcpmieda/ecossistema-escola/issues/273) — execução serial opcional pelo Codex 5.6 High.

## Estado atual

Dez ondas foram integradas. A décima entregou:

- #269/PR #275 — repositório D1 local das oito entidades além do ano acadêmico;
- #270/PR #276 — lotes de importação e histórico por fonte lógica;
- #271/PR #277 — ocorrências de Auditoria e reconciliações;
- #272 — composição integral em uma única `PersistenceUnitOfWorkV1`.

Merges funcionais:

```text
#269  57e7a98585b825926b7d39e7cd63b884a5bb212b
#270  2f5ed83ccb470e88b57a82bdf950aa158c59ab74
#271  79a24263eb416ffd2218de7e3a263da700435679
```

A produção continua sem D1 acadêmico provisionado, binding remoto ou migration remota. Nenhuma nova tela ou persistência oficial foi ativada.

## Décima primeira onda

- [#278 — read model local da Central do Aluno](https://github.com/mcpmieda/ecossistema-escola/issues/278) — **Codex**;
- [#279 — read model local da Central da Turma](https://github.com/mcpmieda/ecossistema-escola/issues/279) — **Codex**;
- [#280 — read models locais de Professor e Componente](https://github.com/mcpmieda/ecossistema-escola/issues/280) — **Codex**;
- [#281 — integração da décima primeira onda](https://github.com/mcpmieda/ecossistema-escola/issues/281) — **Pro**, sem autorização atual ao Codex.

As implementações possuem caminhos disjuntos e consomem a porta de entidades por injeção. Não criam UI, endpoint, contrato compartilhado ou acesso remoto.

## Sessão temporária serial

A #273 não substitui issues, branches, PRs, testes, integração ou deploy. Ela apenas permite que uma única sessão do Codex 5.6 High execute a fila oficial em série:

```text
#278 → #279 → #280
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

Ainda faltam os read models funcionais, sua ligação posterior à interface e autorização explícita para qualquer recurso remoto.

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
