# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.
- [Issue #318](https://github.com/mcpmieda/ecossistema-escola/issues/318) — integração planejada da próxima onda.

## Estado atual

Quatorze ondas foram integradas. A onda 14 materializou as implementações amplas dos contratos da onda anterior:

- #302/PR #312 — Operational Workspace F5 local/preview, contrato de transporte, catálogo explícito de anos, único bridge HTTP acadêmico autorizado e HeroUI no shell;
- #303/PR #313 — Audit Workspace provider-independent + read-source D1 para lotes, ocorrências e reconciliações;
- #304/PR #310 — read model provider-independent de Desempenho, com fonte em lote obrigatória e sem N+1 na fronteira;
- #305/PR #311 — emissão provider-independent de Boletins, snapshots versionados por porta e reimpressão histórica sem recálculo;
- #306/PR #319 — composição segura da onda: Auditoria ligada internamente ao runtime D1 autorizado, sem endpoint/UI; Desempenho e Boletins permanecem sem composição física.

Merges das quatro frentes:

```text
#302 / #312  af67eae671a3f76e7394e2951fb240a599a86d81
#303 / #313  b488a887a980d999cb5c3687f4dcf3e47b125e29
#304 / #310  e919e18e3d00c175b736200265adb4ac3986e5b0
#305 / #311  292cf17703f1e5d24f8c6c24cdb0fc9a8fa90d67
```

A produção continua sem D1 acadêmico provisionado, binding remoto ou migration remota. O código do Operational Workspace pode existir no bundle, mas o runtime acadêmico permanece fail-closed em `production` antes de inspecionar o binding. Auditoria, Desempenho e Boletins não ganharam endpoint acadêmico de produção nesta onda.

## Próxima onda — quatro frentes grandes e paralelas

As issues abaixo foram pré-criadas bloqueadas pela #306 e são liberadas somente depois do merge, deploy e smokes desta integração:

- [#314 — Audit Workspace UI/HTTP local/preview](https://github.com/mcpmieda/ecossistema-escola/issues/314) — **Extra Alto**;
- [#315 — fonte física em lote de Desempenho sem N+1](https://github.com/mcpmieda/ecossistema-escola/issues/315) — **GPT-5.6 Sol, esforço máximo**;
- [#316 — hardening/materialização agregada e snapshots locais de Boletins](https://github.com/mcpmieda/ecossistema-escola/issues/316) — **GPT-5.6 Sol, esforço máximo**;
- [#317 — evolução/hardening do Operational Workspace](https://github.com/mcpmieda/ecossistema-escola/issues/317) — **Extra Alto**;
- [#318 — integração da próxima onda](https://github.com/mcpmieda/ecossistema-escola/issues/318) — **Extra Alto**, bloqueada pelas quatro frentes.

Os caminhos foram separados para permitir execução paralela: a frente A possui shell/Functions/HTTP de Auditoria; B possui o adaptador físico de Desempenho; C permanece em Boletins; D fica restrita ao módulo cliente do Operational Workspace.

## Sessão temporária #273

A #273 é histórica e não orquestra a fila. O processo oficial permanece:

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
quatro frentes verdes → integração própria → main → deploy → próxima onda
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
- processamento somente em memória no fluxo publicado;
- código do Operational Workspace presente, mas sem acesso a dados acadêmicos enquanto o runtime de produção permanecer fechado.

Não existem em produção banco D1 acadêmico remoto, persistência acadêmica, Audit Workspace HTTP/UI, Desempenho físico/HTTP/UI ou emissão/PDF de Boletins.

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

Existe uma única composição oficial de 2026. Ela referencia diretamente os perfis nativos integrados, não escolhe ano pelo relógio e falha para contexto ausente, duplicado, inativo ou incompatível. O Operational Workspace enumera IDs/anos persistidos e exige seleção explícita; não usa relógio nem convenção de ID.

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
- autorização opaca emitida e validada no servidor;
- rotas administrativas autenticadas, autorizadas e `no-store`;
- uma única fachada operacional com Aluno, Turma, Professor, Componente e pesquisa acadêmica;
- um único bridge HTTP do Operational Workspace, local/preview;
- Audit Workspace composto internamente no mesmo runtime e na mesma UoW, sem endpoint;
- Desempenho implementado apenas na camada provider-independent;
- Boletins implementados apenas na camada provider-independent, sem PDF ou snapshot remoto.

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