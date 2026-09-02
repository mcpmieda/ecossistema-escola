# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.** Issues-pai (`#182`, `#184`–`#192`) são acompanhamento; integrações rodam somente pela issue integradora correspondente.

## Onda 19 — integração #356

| Frente | Issue / PR | Resultado |
| :----: | ---------- | --------- |
| F4 | `#353 / #357` | revisão autoritativa 7/7 de Reconciliação/Auditoria, sem taxonomia inventada |
| F5 | `#354 / #358` | cadastro/confirmação de Professor + atribuições anuais no Operational Workspace existente |
| F6 | `#355 / #359` | dois gráficos oficiais; comparação proporcional permanece fail-closed sem semântica canônica |
| Integração | `#356 / #362` | composição F5, testes combinados, docs e publicação |

Heads validados das frentes:

- #353: `f701a3dfdf1f7d330b82988859110e296df7e5e4`;
- #354: `1a001e41158782eab633ccf600e4b97280d08453`;
- #355: `a95a90319f5f955fb8ece16b8d26f1b2f9a78452`.

## Invariantes atuais

- `authorityMode: imported-source`;
- ano acadêmico explícito;
- autorização efetiva no servidor + `gradebook.persistence.admin`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- nenhuma migration/binding/secret/recurso acadêmico remoto na onda 19;
- comparação F6 continua `not-comparable` quando solicitada sem semântica oficial;
- nenhuma média, ranking, taxa, tolerância ou regra acadêmica inventada;
- somente dados sintéticos no repositório/CI.

## Estado funcional

- **F4:** revisão autoritativa concluída 7/7; pode fechar após a publicação da #356.
- **F5:** Centrais + cadastro/confirmação docente + atribuições anuais; pode fechar após a publicação da #356.
- **F6:** gráficos oficiais entregues; fase permanece aberta exclusivamente pelo hard stop de semântica da comparação proporcional.
- **F7/F8:** Conselho V2, decisões/snapshots duráveis, PDF e Relatórios permanecem integrados.
- **F9:** hardening integrado; produção/piloto/autoridade continuam não autorizados.

## Próximo passo

Após #356 concluída:

- **#360** — readiness F9, rollback/recuperação e protocolo de piloto, sem ativar produção;
- **#361** — integradora de readiness, bloqueada pela #360.

A #347 continua separada para a futura transição segura de autoridade e não pode ser antecipada.

## Fluxo

```text
issue [PRONTA]
  → branch curta
  → um PR
  → npm run verify
  → handoff
  → sem merge individual

frentes verdes
  → integradora
  → merges fixados
  → wiring/testes/docs mínimos
  → verify
  → PR de integração
  → merge/deploy/smokes
  → parents/PROJECT_STATE
```

Não usar App Factory, Factory Runs, subagentes ou orquestração salvo autorização explícita da issue.
