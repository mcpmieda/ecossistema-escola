# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.
- [Issue #297](https://github.com/mcpmieda/ecossistema-escola/issues/297) — integração planejada da décima terceira onda.

## Estado atual

Doze ondas foram integradas. A décima segunda entregou:

- #286/PR #290 — contrato V1 da pesquisa global acadêmica autorizada;
- #287/PR #291 — read model local e provider-independent da pesquisa;
- #288/PR #292 — composição da pesquisa na fachada operacional única e no runtime local/preview.

Merges funcionais da onda:

```text
#286  d9640dbc0e807af324116c549f825c3d13ecdf89
#287  9e17abb4c2386cbfb03451c402a8c4282e9b4181
```

A pesquisa acadêmica usa somente aluno, turma, professor e componente, com ano explícito, campos mínimos, ordem determinística e cursor opaco. Não usa fuzzy matching, heurística de identidade, nota, resultado ou evidência de origem. A autorização continua no servidor pela capability `gradebook.persistence.admin`.

A produção continua sem D1 acadêmico provisionado, binding remoto ou migration remota. Nenhuma UI, endpoint ou consulta acadêmica foi ativada no site oficial pela décima segunda onda.

## Décima terceira onda — contratos amplos

As quatro frentes podem executar em paralelo depois da integração da #288 porque usam caminhos disjuntos e não editam documentação central:

- [#293 — contrato da experiência operacional F5](https://github.com/mcpmieda/ecossistema-escola/issues/293) — **Pro**;
- [#294 — contrato do workspace de Auditoria/revisão F4](https://github.com/mcpmieda/ecossistema-escola/issues/294) — **Pro**;
- [#295 — contrato do read model de Desempenho F6](https://github.com/mcpmieda/ecossistema-escola/issues/295) — **Pro**;
- [#296 — `BulletinModelV1` e emissão versionada F8](https://github.com/mcpmieda/ecossistema-escola/issues/296) — **Pro**;
- [#297 — integração da onda](https://github.com/mcpmieda/ecossistema-escola/issues/297) — **Pro**, bloqueada pelas quatro anteriores.

Cada frente congela uma capacidade coerente e verificável. Implementação HeroUI, endpoints, resolução persistida, matriz de Desempenho, prévia/PDF e snapshots pertencem a ondas posteriores, somente depois dos contratos correspondentes entrarem na `main`.

## Sessão temporária #273

A #273 não é orquestrador da nova onda e não possui fila paralela autorizada. O processo oficial permanece:

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
onda concluída → integração própria → main → deploy → próxima onda
```

Não usar App Factory, Factory Runs, agentes auxiliares ou automação permanente.

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
- processamento somente em memória, sem persistência acadêmica.

A pesquisa acadêmica integrada nesta onda não é a pesquisa de navegação já visível e permanece indisponível em produção.

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

### Persistência, reconciliação e consulta

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
- uma única `PersistenceUnitOfWorkV1` local;
- uma única fachada operacional com Centrais de Aluno, Turma, Professor e Componente;
- pesquisa acadêmica autorizada composta nessa mesma fachada, sem endpoint ou consulta paralela.

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