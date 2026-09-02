# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Issues-pai (`#182`, `#184`–`#192`) são acompanhamento. Integrações são executadas apenas pela issue de integração da onda.

## Onda 16 — estado integrado

| Frente | Issue / PR | Resultado |
| :----: | ---------- | --------- |
| 1 | `#325 / #329` | Desempenho end-to-end local/preview: transporte, HTTP e HeroUI |
| 2 | `#326 / #331` | Boletins end-to-end: preview, emissão/lote, snapshots, histórico e reimpressão |
| 3 | `#327 / #330` | Council Workspace/Decision V1, decisão humana, histórico/CAS e HeroUI |
| Fundação | `#332 / #333` | projeção anual oficial upstream do Conselho, sem schema nem nova regra |
| Integração | `#328` | wiring central de F6/F7/F8 e sincronização canônica |

Os merges anteriores #329/#331/#330 permanecem válidos. A #332 foi integrada depois do hard stop inicial da #328 para disponibilizar a projeção oficial agregada que o Conselho precisava sem recalcular elegibilidade no workspace.

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

## Capacidades utilizáveis em local/preview

### Operational Workspace

- Centrais de Aluno, Turma, Professor e Componente;
- ano explícito, pesquisa acadêmica e navegação `kind + id` opaca;
- abort/dedupe/stale-response discard e paginação resiliente.

### Audit Workspace

- lotes, ocorrências, reconciliações, filtros, cursor, detalhe e pendências;
- resolução versionada/CAS com ator e instante server-side.

### Desempenho — F6

- `PerformancePage` ligada ao shell;
- quatro lentes, regular/recovery e período explícito;
- paginação independente de linhas/colunas;
- drill-down de aluno/célula;
- raw source evidence não atravessa HTTP;
- `recovery + result` continua `FinalRecoveryV1`;
- recovery das demais lentes continua trimestral;
- annual non-result continua `insufficient-data`;
- comparação continua fail-closed (`not-comparable`) enquanto a semântica oficial não estiver integrada.

### Conselho — F7

- `CouncilWorkspacePage` ligada ao shell com seleção explícita de ano/turma;
- fonte real local/preview é `createGradebookD1CouncilOfficialProjectionSourceV1(...)` da #332;
- 0/1/2/3+/insuficiente vêm somente dessa projeção upstream;
- T1/T2/T3 usam o lado importado de `TermResultV1`;
- REC usa `FinalRecoveryV1.recoveryGrade.imported` somente quando aplicável e unívoca;
- REC ausente é `not-applicable`; REC ambígua é `insufficient-data`;
- Council Workspace não chama `resolveNativeAnnualOutcome`;
- decisão humana, justificativa, histórico append-only e CAS permanecem separados do cálculo;
- ator e instante são server-side;
- decisão formal coerente preexistente bloqueia segunda decisão;
- votação, desempate, frequência, participantes e exceções continuam fora da V1.

O store de decisões continua process-local/preview e descartável; não existe garantia cross-restart.

### Boletins — F8

- `BulletinPage` ligada ao shell;
- seleção explícita de ano/turma/aluno(s)/período/modelo;
- preview e emissão usam o mesmo `BulletinModelV1` canônico;
- emissão individual e lote agregado, com falha isolada por aluno;
- snapshots locais append-only, versionados e imutáveis;
- histórico e reimpressão usam exclusivamente snapshot histórico, sem leitura acadêmica atual.

**PDF:** `PDF/renderização pendente por decisão arquitetural`. Nenhuma biblioteca/renderer foi escolhida na #328.

## F1 — concluída definitivamente

F1 está **7/7** e a #184 está fechada como `completed`. O handoff sanitizado confirma que o protocolo real aplicável, o smoke autenticado completo e a falha isolada passaram; nenhum arquivo real foi modificado, nenhum dado identificável foi publicado e nenhum gate histórico real antigo permanece pendente.

Os gates históricos de validação real controlada e smoke completo foram satisfeitos e não devem reaparecer como pendências. Políticas gerais de privacidade, segurança e futuros gates próprios de produção continuam vigentes.

## Estado real do D1

Local/preview possui migrations 0001–0003, runtime autorizado, UoW acadêmica, fontes/read models e as experiências F4–F8 acima.

Produção ainda não possui D1 acadêmico remoto, binding/migration remota ou consulta/persistência acadêmica ativa. A presença das páginas/handlers no código não significa ativação de produção: o runtime falha fechado antes de inspecionar `GRADEBOOK_D1`.

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

Não usar App Factory, Factory Runs, subagentes ou orquestração salvo autorização explícita da issue.

## Próxima onda

A próxima onda só deve ser liberada depois do fechamento da #328, deploy e smokes aplicáveis. Deve voltar a usar **2 a 4 frentes grandes, verticalmente coerentes, mais uma integradora**, sem microissues. Prioridades naturais pós-onda 16: PDF canônico de Boletins como uma decisão grande única, F9/hardening institucional e acabamento operacional/UX das experiências agora visíveis.
