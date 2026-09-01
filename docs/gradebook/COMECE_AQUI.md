# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua como tarefa comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#318` — integração da próxima onda, bloqueada pelas quatro frentes.

As integrações `#203`, `#210`, `#214`, `#221`, `#229`, `#237`, `#246`, `#256`, `#264`, `#272`, `#281`, `#288`, `#297` e `#306` pertencem às ondas já integradas quando este documento estiver na `main`.

## Décima quarta onda — implementações integradas

| Frente | Issue | Entrega | PR / merge |
| :----: | ----: | ------- | ---------- |
| A | `#302` | Operational Workspace F5, transporte, catálogo de anos, bridge local/preview e HeroUI | `#312` / `af67eae` |
| B | `#303` | Audit Workspace provider-independent + read-source D1 | `#313` / `b488a88` |
| C | `#304` | Read model provider-independent de Desempenho | `#310` / `e919e18` |
| D | `#305` | Emissão provider-independent de Boletins | `#311` / `292cf17` |

A #306/PR #319 integra os quatro. A composição autorizada é deliberadamente assimétrica:

- Operational Workspace: mantém **um único** bridge HTTP local/preview;
- Audit Workspace: composto internamente em `GradebookD1RuntimeV1`, na mesma UoW e sob a autorização opaca existente, mas sem HTTP/UI;
- Desempenho: somente aplicação provider-independent; nenhum adapter físico/runtime/endpoint nesta onda;
- Boletins: somente aplicação provider-independent; nenhum PDF, endpoint ou persistência remota de snapshot nesta onda.

Invariantes preservados:

- ano acadêmico explícito, sem relógio;
- `gradebook.persistence.admin` e autorização efetiva no servidor;
- produção fail-closed antes de tocar no binding;
- `authorityMode: imported-source`;
- nenhum motor/regra acadêmica concorrente;
- nenhum recurso remoto, migration, capability ou papel novo.

## Próxima onda — quatro frentes grandes e paralelas

As issues foram pré-criadas bloqueadas pela #306. Depois que #306 concluir merge, deploy e smokes, os títulos são liberados para `[PRONTA]`.

| Frente | Issue | Trabalho | Executor | Caminhos reservados principais |
| :----: | ----: | -------- | -------- | ------------------------------ |
| A | `#314` | Audit Workspace HeroUI + HTTP local/preview | **Extra Alto** | `src/features/gradebook/audit-workspace/**`, `server/gradebook/http/audit-workspace-routes-v1.ts`, `functions/[[path]].ts`, `src/App.tsx` |
| B | `#315` | Fonte física D1 em lote para Desempenho sem N+1 | **GPT-5.6 Sol, esforço máximo** | `server/gradebook/persistence/d1/performance/**` |
| C | `#316` | Hardening/materialização agregada e snapshots locais de Boletins | **GPT-5.6 Sol, esforço máximo** | `server/gradebook/application/bulletins/**` |
| D | `#317` | Evolução/hardening do Operational Workspace | **Extra Alto** | `src/features/gradebook/operational-workspace/**` |

A integração seguinte é `#318`, bloqueada pelas quatro.

### Frente A — #314

- consome o Audit Workspace já composto pela #306;
- cria apenas bridge/UI local/preview;
- reutiliza `requireAuth`, autorização opaca e `gradebook.persistence.admin`;
- ator e instante permanecem server-side;
- promoção continua informativa; planejador/executor existentes continuam exclusivos;
- produção permanece fechada antes do binding.

### Frente B — #315

- implementa `ClassPerformanceSourceV1` físico em lote sobre o schema existente;
- mede/limita quantidade de queries e proíbe N+1 por aluno/componente;
- não compõe runtime/HTTP/UI;
- hard stop se exigir migration/schema novo ou regra acadêmica.

### Frente C — #316

- reduz leituras repetidas da emissão em lote;
- mantém snapshots imutáveis/versionados e reimpressão sem recálculo;
- trabalha apenas com snapshots locais/descartáveis ou porta já autorizada;
- nenhum PDF, endpoint ou snapshot remoto;
- hard stop se durabilidade exigir migration/tabela nova.

### Frente D — #317

- endurece UX, acessibilidade, paginação e descarte de respostas antigas;
- mantém o bridge único existente;
- não toca Functions/runtime/contratos;
- produção acadêmica continua fechada.

## Sessão temporária #273

A #273 não é orquestrador paralelo e não recebe a nova fila. Cada issue executável deve ser entregue diretamente ao agente indicado, com branch e PR próprios.

```text
issue → branch curta → PR → npm run verify → handoff
quatro frentes verdes → #318 → main → deploy → próxima onda
```

Não usar App Factory, Factory Runs, subagentes ou automação permanente.

## Estado real do D1

Já existem localmente:

- migrations 0001–0003 e 21 tabelas;
- leitura/escrita de ano, entidades, fonte, lotes, registros, associações e Auditoria;
- promoção transacional local com CAS, savepoints e rollback;
- runtime injetado permitido somente em local/preview;
- runner canônico e idempotente;
- capability administrativa no servidor;
- quatro read models operacionais e pesquisa na mesma fachada;
- Operational Workspace com transporte/bridge/UI local-preview;
- Audit Workspace composto internamente no runtime;
- read model provider-independent de Desempenho;
- emissão provider-independent de Boletins.

Ainda não existem em produção:

- banco D1 acadêmico remoto/persistente;
- binding remoto ou migration remota;
- consulta/persistência acadêmica ativa;
- Audit Workspace HTTP/UI;
- fonte física/endpoint/UI de Desempenho;
- PDF ou persistência remota de snapshots de Boletins.

## Gates manuais que não bloqueiam o trabalho local seguro

- executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado;
- expandir o SHA-256 completo no smoke autenticado;
- observar a etapa transitória de hash;
- conferir falha isolada controlada.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Instrução para execução comum

1. Entregue somente uma issue `[PRONTA]` ao agente indicado.
2. O agente lê `AGENTS.md`, `docs/gradebook/`, a issue e os contratos citados.
3. Executa diretamente, sem App Factory ou agentes auxiliares.
4. Cria branch curta e um único PR.
5. Executa `npm run verify` no SHA final e registra o handoff.
6. Não faz merge, deploy, provisionamento nem altera `PROJECT_STATE.yaml`.
7. O integrador executa a issue própria da onda.