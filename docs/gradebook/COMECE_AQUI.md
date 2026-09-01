# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua como tarefa comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#297` — integração da décima terceira onda, bloqueada pelas quatro frentes.

As integrações `#203`, `#210`, `#214`, `#221`, `#229`, `#237`, `#246`, `#256`, `#264`, `#272`, `#281` e `#288` foram concluídas.

## Décima segunda onda — concluída e integrada

|  Issue | Entrega                                                       | PR/merge           |
| -----: | ------------------------------------------------------------- | ------------------ |
| `#286` | Contrato V1 da pesquisa global acadêmica autorizada           | `#290` / `d9640db` |
| `#287` | Read model local e provider-independent da pesquisa           | `#291` / `9e17abb` |
| `#288` | Fachada única, runtime local/preview, integração e próxima onda | `#292`             |

A pesquisa acadêmica:

- usa somente aluno, turma, professor e componente;
- exige ano explícito;
- retorna somente campos mínimos;
- usa ordem determinística e cursor opaco;
- não usa fuzzy matching ou heurística de identidade;
- não retorna nota, resultado ou evidência de origem;
- reutiliza `gradebook.persistence.admin` no servidor;
- permanece sem endpoint, UI ou ativação em produção.

## Décima terceira onda — quatro frentes paralelas

Depois da #288 na `main`, estas quatro issues ficam prontas e podem começar em paralelo porque seus caminhos são disjuntos:

| Frente |  Issue | Trabalho                                               | Agente | Caminho exclusivo                                      |
| :----: | -----: | ------------------------------------------------------ | ------ | ------------------------------------------------------ |
|   A    | `#293` | Contrato V1 da experiência operacional F5              | **Pro** | `shared/gradebook-contracts/operational-workspace/**` |
|   B    | `#294` | Contrato V1 do workspace de Auditoria/revisão F4       | **Pro** | `shared/gradebook-contracts/audit-workspace/**`       |
|   C    | `#295` | Contrato V1 do read model de Desempenho F6             | **Pro** | `shared/gradebook-contracts/performance/**`           |
|   D    | `#296` | `BulletinModelV1` e emissão versionada F8              | **Pro** | `shared/gradebook-contracts/bulletins/**`             |

Testes também ficam em subdiretórios próprios sob `tests/gradebook/contracts/**`. Nenhuma dessas issues altera documentação canônica, UI, runtime ou outro contrato compartilhado.

A integração `#297` permanece bloqueada por `#293`, `#294`, `#295` e `#296`.

## Por que as implementações ainda não começam

### Frente A — F5

- **Dependência ausente:** contrato compartilhado entre read models do servidor e experiência React;
- **decisão necessária:** forma provider-independent dos estados e intenções de navegação, sem inventar rota acadêmica;
- **caminho conflitante:** `src/platform/**` concentra shell, pesquisa e página atual;
- **menor próxima tarefa segura:** executar #293 e congelar o contrato antes da UI HeroUI/local-preview.

### Frente B — F4

- **Dependência ausente:** contrato único de lista, detalhe, filtros, pendências e resolução versionada;
- **decisão necessária:** superfície operacional sem criar transição, escrita ou promoção paralela;
- **caminho conflitante:** executor, repositórios e futura UI não podem ser alterados na mesma issue de contrato;
- **menor próxima tarefa segura:** executar #294, mantendo promoção exclusiva em `executeImportChangePlan`.

### Frente C — F6

- **Dependência ausente:** `ClassPerformanceReadModelV1` efetivamente congelado;
- **decisão necessária:** matriz, quatro lentes, cobertura, comparabilidade, paginação e ausência explícita;
- **caminho conflitante:** UI não pode definir semântica analítica nem cálculo;
- **menor próxima tarefa segura:** executar #295 antes de qualquer implementação ou HeroUI.

### Frente D — F8

- **Dependência ausente:** `BulletinModelV1` e emissão/snapshot versionados;
- **decisão necessária:** modelo canônico comum a prévia e PDF, três apresentações e reimpressão;
- **caminho conflitante:** templates não podem receber cálculo nem definir persistência histórica;
- **menor próxima tarefa segura:** executar #296 antes de read model, PDF ou armazenamento de snapshots.

## Sessão temporária #273

A #273 não é orquestrador paralelo e não recebe a nova fila. Cada issue da décima terceira onda deve ser entregue diretamente ao agente indicado, com branch e PR próprios.

```text
issue → branch curta → PR → npm run verify → handoff
quatro contratos verdes → integração #297 → main → deploy → próxima onda
```

Não usar App Factory, Factory Runs, subagentes ou automação permanente.

## Estado real do D1

Já existem:

- migrations 0001–0003 e 21 tabelas;
- leitura/escrita local de ano, entidades, fonte, lotes, registros, associações e Auditoria;
- promoção transacional local com CAS, savepoints e rollback;
- runtime injetado permitido somente em local/preview;
- runner canônico e idempotente das migrations;
- capability administrativa no servidor e rotas `no-store`;
- quatro read models operacionais e pesquisa acadêmica na mesma fachada autorizada.

Ainda não existem:

- banco D1 remoto/persistente;
- binding remoto ou migration remota;
- persistência ou consulta acadêmica ativa no site oficial;
- experiência HeroUI das Centrais;
- workspace funcional de Auditoria/revisão;
- matriz de Desempenho;
- emissão de boletim/PDF ou snapshots.

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