# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Issues-pai (`#182`, `#184`–`#192`) são acompanhamento. Integrações são executadas apenas pela issue de integração da onda.

## Onda 15 — estado integrado

| Frente | Issue / PR | Resultado |
| :----: | ---------- | --------- |
| A | `#314 / #321` | Audit Workspace HeroUI + HTTP local/preview |
| B | `#315 / #323` | fonte D1 física de Desempenho em lote, 6 queries, sem N+1 |
| C | `#316 / #322` | materialização agregada + snapshots locais imutáveis/versionados de Boletins |
| D | `#317 / #320` | hardening do Operational Workspace |
| Integração | `#318 / #324` | composição interna do Desempenho no runtime; sem HTTP/UI F6 nesta onda |

Merges das quatro frentes:

```text
#321  fd3fdc32d85227fa12a84477feaca0892e773816
#323  a101819daef4791e5a1f5a5a64b554ab97d59263
#322  2875749517ea0c145d73c3dc1df9aa11a8dc18a3
#320  d7f984e8753e5ad102f8aeb6a135f4870b8298e6
```

## Invariantes atuais

- `authorityMode: imported-source`;
- ano acadêmico sempre explícito;
- autorização efetiva no servidor;
- capability existente `gradebook.persistence.admin`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- nenhum banco/binding/migration/secret/recurso remoto acadêmico em produção;
- nenhuma regra acadêmica na UI/HTTP;
- somente dados sintéticos no repositório/CI.

## Capacidades já utilizáveis em local/preview

### Audit Workspace

- lotes, ocorrências, reconciliações, filtros, cursor, detalhe e pendências;
- resolução versionada/CAS;
- ator e instante server-side;
- `POST /api/gradebook/audit-workspace` único e `no-store`;
- HeroUI e estados acessíveis.

### Operational Workspace

- Aluno, Turma, Professor e Componente;
- ano explícito e pesquisa acadêmica;
- navegação `kind + id`;
- `POST /api/gradebook/operational-workspace` único;
- request gate com abort/dedupe/stale-response discard;
- troca de ano segura e paginação deduplicada.

## Capacidades integradas, ainda não expostas

### Desempenho

- `GradebookD1ClassPerformanceSourceV1` físico;
- `ClassPerformanceReadModelV1`;
- composição interna em `GradebookD1RuntimeV1.classPerformanceReadModel()`;
- 6 queries em lote / zero N+1;
- comparação continua fail-closed sem resolvedor oficial;
- ainda sem HTTP/UI.

### Boletins

- materialização agregada;
- emissão provider-independent;
- snapshots locais, imutáveis e versionados;
- reimpressão sem recálculo;
- ainda sem HTTP/UI/PDF/persistência remota.

## Próxima onda — três frentes grandes em paralelo

O estado da própria issue define quando `[BLOQUEADA]` muda para `[PRONTA]` após deploy/smokes da #318.

| Frente | Issue | Objetivo | Executor |
| :----: | ----: | -------- | -------- |
| 1 | `#325` | Desempenho end-to-end local/preview | **Extra Alto** |
| 2 | `#326` | Boletins end-to-end local/preview | **Extra Alto** |
| 3 | `#327` | Conselho de Classe V1 sem regras novas | **Extra Alto** |
| Integração | `#328` | wiring, revisão, merge, deploy e estado | **Extra Alto** |

As três frentes reservam wiring central para #328 sempre que isso melhora o paralelismo.

### #325 — Desempenho end-to-end

- transporte/HTTP local-preview;
- matriz HeroUI;
- quatro lentes;
- regular/recovery;
- paginação linhas/colunas;
- detalhe aluno/célula;
- stale-response discard e a11y;
- comparabilidade permanece `not-comparable` quando solicitada sem resolvedor oficial.

### #326 — Boletins end-to-end

- seleção, preview, emissão, reimpressão e lote;
- snapshots históricos no ciclo local/preview suportado;
- HTTP/UI;
- preview e emissão usam o mesmo `BulletinModelV1`;
- PDF entra no mesmo PR apenas se não exigir decisão/runtime/biblioteca nova; caso contrário há **um único bloqueio explícito de PDF**, sem microissues.

### #327 — Conselho V1

- fila e elegibilidade derivadas apenas do resultado anual já integrado;
- visão anual T1/T2/T3/REC;
- decisão humana separada do cálculo;
- justificativa, histórico e CAS;
- nenhuma votação, desempate, frequência, participantes ou exceção inventada.

### F9

Não há frente F9 nesta onda. Segurança/a11y/recovery continuam requisitos transversais dos três PRs; uma frente F9 grande será reavaliada depois de F6/F7/F8 ganharem massa visível adicional.

## Estado real do D1

Local/preview já possui:

- migrations 0001–0003 e 21 tabelas;
- contexto, entidades, fonte, lotes, registros, associações e Auditoria;
- promoção transacional com CAS/savepoints/rollback;
- runtime autorizado;
- Operational/Audit Workspaces;
- fonte/read model físico de Desempenho composto internamente.

Produção ainda não possui:

- D1 acadêmico remoto;
- binding/migration remota;
- consulta ou persistência acadêmica ativa;
- Performance HTTP/UI;
- Boletins HTTP/UI/PDF;
- Conselho operacional.

## Fluxo de execução

```text
issue [PRONTA]
  → branch curta
  → um PR
  → npm run verify
  → handoff
  → sem merge individual

frentes verdes
  → issue de integração
  → merges fixados
  → composição/wiring
  → verify
  → PR único de integração
  → merge/deploy/smokes
  → docs/PROJECT_STATE/issues-pai
```

Não usar App Factory, Factory Runs, subagentes ou orquestração.

## Gates manuais que não bloqueiam trabalho sintético seguro

- `REAL_DATA_VALIDATION.md` em ambiente privado;
- smoke autenticado completo quando houver ambiente/dados autorizados.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.