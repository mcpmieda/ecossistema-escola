# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Issues-pai (`#182`, `#184`–`#192`) são acompanhamento. Integrações são executadas apenas pela issue de integração da onda.

## Onda 18 — integração #343

| Frente | Issue / PR | Resultado |
| :----: | ---------- | --------- |
| A | `#340 / #351` | snapshots de Boletins e decisões de Conselho duráveis em D1 local/preview, migration 0004, append-only/CAS |
| B | `#341 / #345` | Conselho V2: revisão, fechamento explícito, fotografia/histórico imutável e votação opcional fail-closed no desempate |
| C | `#342 / #346` | Relatórios institucionais sobre dados oficiais e PDF em lote bounded/sequencial |
| Integração | `#343 / #352` | providers duráveis, Council V2/Reports no shell, bridges, verify/deploy/docs e liberação da onda 19 |

Heads validados das frentes:

- #340: `a7be6d44591b2212205455934a20a7e4ce307e53`;
- #341: `ca87c81b098cd5b43111aa8684d5285b9666e988`;
- #342: `540d408196f3a7a9d71337315100efc4245b9c10`.

## Invariantes atuais

- `authorityMode: imported-source` continua ativo nesta onda;
- ano acadêmico sempre explícito;
- autorização efetiva no servidor;
- capability existente `gradebook.persistence.admin`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- nenhuma migration remota, binding, secret ou recurso acadêmico remoto;
- nenhuma regra acadêmica na UI/HTTP/wiring;
- nenhuma heurística de REC, comparação, taxa, média ou ranking inventada;
- somente dados sintéticos no repositório/CI.

## Bridges únicos

- `POST /api/gradebook/operational-workspace`;
- `POST /api/gradebook/audit-workspace`;
- `POST /api/gradebook/performance`;
- `POST /api/gradebook/bulletins`;
- `POST /api/gradebook/reports`;
- `POST /api/gradebook/council-workspace`.

Todos os dados acadêmicos enviados por esses bridges usam `no-store`. Claims de papel/capability/ator/instante vindos do navegador não substituem autorização ou identidade server-side.

## Shell do Banco

- rota do Banco lazy;
- Importação, Centrais, Auditoria, Desempenho, Boletins, Relatórios e Conselho em navegação compacta por tabs;
- superfícies acadêmicas carregadas apenas quando ativadas;
- zero requests acadêmicos automáticos ao entrar no Banco;
- error boundary da rota e boundary isolado por superfície;
- áreas inativas fora do foco/a11y e estado React apenas efêmero;
- busca global pode apontar diretamente para `#/banco-de-notas?area=operational|audit|performance|bulletins|reports|council`;
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
- comparação continua fail-closed (`not-comparable`) enquanto a semântica oficial não estiver integrada.

### Conselho — F7 V2

- fonte oficial #332 para 0/1/2/3+/insuficiente, sem recálculo no workspace;
- decisões duráveis em D1 local/preview, append-only e CAS;
- fechamento explícito da turma, revisão pré-fechamento e fotografia histórica imutável;
- edição de decisão/contagem rejeitada após fechamento;
- votação numérica é opcional e nunca fabrica decisão;
- empate permanece fail-closed enquanto identidade/capability oficial de diretor não existir;
- estado da sessão/reunião V2 permanece provider-independent e process-local/preview nesta versão; a migration 0004 não inventa persistência para sessão/fechamento.

### Boletins e Relatórios — F8

- três modelos canônicos sobre `BulletinModelV1`;
- preview/emissão mesma materialização;
- snapshots/histórico duráveis em D1 local/preview;
- reimpressão exclusivamente de snapshot histórico, sem leitura acadêmica atual;
- PDF individual canônico, client-side/lazy;
- PDF em lote bounded e sequencial: até 3 documentos, 72 páginas totais e uma geração concorrente;
- reimpressão em lote usa somente snapshots históricos;
- workspace de Relatórios cobre resultados/aproveitamento oficial, composição, recuperação, Conselho e Auditoria;
- indicador derivado sem semântica oficial permanece fail-closed.

## F1 — concluída definitivamente

F1 está **7/7** e a #184 está fechada como `completed`. Protocolo real, smoke autenticado e falha isolada passaram; nenhum arquivo real foi modificado, nenhum dado identificável foi publicado e nenhum gate histórico real antigo permanece pendente.

## Estado real do D1

Local/preview possui migrations 0001–0004 e 25 tabelas. A 0004 adiciona somente os streams/versions necessários para snapshots de Boletins e decisões de Conselho. Não existe purge automático nem política de retenção inventada.

Produção ainda não possui D1 acadêmico remoto, binding/migration remota ou consulta/persistência acadêmica ativa. A presença das páginas/handlers/PDF no código não significa ativação de produção: o runtime falha fechado antes de inspecionar `GRADEBOOK_D1`.

## Próxima onda — 19

Após a conclusão da #343:

- #353 — fechamento autoritativo F4 Reconciliação/Auditoria;
- #354 — cadastro/confirmação de Professor e atribuições anuais para fechar F5;
- #355 — comparabilidade oficial e gráficos úteis de F6, sem métrica inventada;
- #356 — integradora da onda 19.

A transição futura para `native-engine` como autoridade está especificada na #347 e **não** é parte da onda 18/19 enquanto os gates F9 não forem satisfeitos.

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
