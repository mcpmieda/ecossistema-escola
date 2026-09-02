# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Issues-pai (`#182`, `#184`–`#192`) são acompanhamento. Integrações são executadas apenas pela issue de integração da onda.

## Onda 17 — integração #337

| Frente | Issue / PR | Resultado |
| :----: | ---------- | --------- |
| A | `#335 / #338` | PDF canônico de Boletins, client-side e lazy, sempre sobre snapshot oficial |
| B | `#336 / #339` | F9: shell lazy, isolamento, segurança/storage, a11y e redução de carga inicial |
| Integração | `#337` | composição final, deep-link por área, verify/deploy/docs e próxima onda |

A composição validada de #335+#336 passou com **100 arquivos / 819 testes**. O renderer PDF fica em chunk separado (~9,71 kB / 3,81 kB gzip). O entry combinado permanece 552,28 kB / 167,15 kB gzip; contabilizando o chunk compartilhado `alert`, o caminho inicial conservador é 661,25 kB / 202,82 kB gzip, abaixo do baseline pós-#328 de 820,68 kB / 235,71 kB gzip.

## Invariantes atuais

- `authorityMode: imported-source`;
- ano acadêmico sempre explícito;
- autorização efetiva no servidor;
- capability existente `gradebook.persistence.admin`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- nenhum banco/binding/migration/secret/recurso remoto acadêmico novo;
- nenhuma regra acadêmica na UI/HTTP/wiring;
- nenhuma heurística de REC ou comparabilidade inventada;
- somente dados sintéticos no repositório/CI.

## Bridges únicos

- `POST /api/gradebook/operational-workspace`;
- `POST /api/gradebook/audit-workspace`;
- `POST /api/gradebook/performance`;
- `POST /api/gradebook/bulletins`;
- `POST /api/gradebook/council-workspace`.

Todos os dados acadêmicos enviados por esses bridges usam `no-store`. Claims de papel/capability/ator/instante vindos do navegador não substituem autorização ou identidade server-side.

## Shell do Banco

- rota do Banco lazy;
- Importação, Centrais, Auditoria, Desempenho, Boletins e Conselho em navegação compacta por tabs;
- superfícies acadêmicas carregadas apenas quando ativadas;
- zero requests acadêmicos automáticos ao entrar no Banco;
- error boundary da rota e boundary isolado por superfície;
- áreas inativas fora do foco/a11y e estado React apenas efêmero;
- busca global pode apontar diretamente para `#/banco-de-notas?area=operational|audit|performance|bulletins|council`;
- nenhum storage acadêmico em `localStorage`, `sessionStorage`, IndexedDB, Cache API ou service worker.

## Capacidades utilizáveis em local/preview

### Operational Workspace

- Centrais de Aluno, Turma, Professor e Componente;
- ano explícito, pesquisa acadêmica e navegação `kind + id` opaca;
- abort/dedupe/stale-response discard e paginação resiliente.

### Audit Workspace

- lotes, ocorrências, reconciliações, filtros, cursor, detalhe e pendências;
- resolução versionada/CAS com ator e instante server-side.

### Desempenho — F6

- quatro lentes, regular/recovery e período explícito;
- paginação independente de linhas/colunas e drill-down aluno/célula;
- raw source evidence não atravessa HTTP;
- `recovery + result` continua `FinalRecoveryV1`;
- demais lentes recovery continuam trimestrais;
- annual non-result continua `insufficient-data`;
- comparação continua fail-closed (`not-comparable`) enquanto a semântica oficial não estiver integrada.

### Conselho — F7

- fonte oficial `createGradebookD1CouncilOfficialProjectionSourceV1(...)` da #332;
- 0/1/2/3+/insuficiente vêm somente da projeção upstream;
- T1/T2/T3 e REC preservam autoridade importada; REC ambígua falha fechada;
- Council Workspace não chama `resolveNativeAnnualOutcome`;
- decisão humana, justificativa, histórico append-only e CAS separados do cálculo;
- store de decisões ainda process-local/preview e descartável.

### Boletins — F8

- três modelos sobre `BulletinModelV1`;
- preview/emissão mesma materialização;
- emissão individual e lote acadêmico agregado;
- snapshots locais append-only/versionados/imutáveis;
- reimpressão exclusivamente de snapshot histórico;
- PDF oficial exclusivamente de `BulletinPdfInputV1` / `BulletinSnapshotV1`;
- renderer client-side P&B/raster lazy, sem fetch acadêmico nem storage persistente no navegador;
- reimpressão PDF faz zero leitura/materialização acadêmica atual e não cria nova versão;
- PDF em lote não é disparado nesta versão; geração de arquivo é individual por snapshot.

## F1 — concluída definitivamente

F1 está **7/7** e a #184 está fechada como `completed`. Protocolo real, smoke autenticado e falha isolada passaram; nenhum arquivo real foi modificado, nenhum dado identificável foi publicado e nenhum gate histórico real antigo permanece pendente.

## Estado real do D1

Local/preview possui migrations 0001–0003, runtime autorizado, UoW acadêmica, fontes/read models e experiências F4–F8.

Produção ainda não possui D1 acadêmico remoto, binding/migration remota ou consulta/persistência acadêmica ativa. A presença das páginas/handlers/PDF no código não significa ativação de produção: o runtime falha fechado antes de inspecionar `GRADEBOOK_D1`.

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
  → próxima onda em grandes passos
```

Não usar App Factory, Factory Runs, subagentes ou orquestração salvo autorização explícita da issue.

## Próxima onda

A #337 deve abrir a próxima onda somente depois de validar a composição final. Priorizar poucas frentes grandes e verticalmente coerentes; não fragmentar durabilidade, Conselho, relatórios ou produção em microissues.
