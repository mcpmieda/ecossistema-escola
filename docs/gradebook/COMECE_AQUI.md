# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.** Issues-pai são acompanhamento; integrações rodam somente pela issue integradora correspondente.

## Onda 23 — produção controlada concluída

| Etapa | Issue | Resultado |
| --- | ---: | --- |
| Recurso/binding | #380 | D1 produtivo único + `GRADEBOOK_D1`, gate OFF |
| Migrations | #381 | 0001–0004, schema 4 / 25, pendentes 0 |
| Smoke | #382 | 5/5 passos verdes, corpus sintético restaurado a zero |
| Integração | #383 | memória canônica + readiness V2, sem nova operação D1 |

SHA/deployment testado pelo smoke: `2fdefa87f186e84ed40637437d4b0199baff82c6`.

## Invariantes atuais

- `authorityMode: imported-source`;
- D1/binding produtivos presentes;
- schema remoto version 4 / 25 tabelas;
- production gate OFF entre janelas autorizadas;
- nenhum dado real usado na onda 23;
- resíduo sintético após smoke: zero;
- piloto real: não iniciado;
- `native-engine`: não ativo;
- #347 permanece bloqueada.

## Readiness

- V1: memória histórica de preparação `prepared-for-manual-authorization`; não foi enfraquecido.
- V2: `production-infrastructure-smoke-validated-awaiting-private-pilot`.
- gates restantes: piloto privado real e autoridade nativa separada.

## Limitações a revisar antes da onda 24

- `reconciliation_v2.case_store`: process-local;
- Conselho V2 sessão/reunião: process-local, sem durabilidade cross-restart;
- write administrativo da configuração de comparação: `not-integrated-hard-stop`.

A #384 / PR #385 ainda não está integrada; não tratá-la como decisão canônica até seu merge próprio.

## Próximo passo

1. **onda 24 — piloto privado real:** revisão de escopo e execução somente por autorização própria, ainda com `imported-source`;
2. investigar/reconciliar divergências representativas encontradas;
3. **#347 — autoridade nativa:** somente após piloto, contratos/gates aplicáveis, vigência e aceite explícitos.

## Fluxo

```text
issue [PRONTA]
  → branch curta
  → um PR
  → npm run verify
  → handoff

frente verde
  → integradora
  → merge fixado
  → testes/docs mínimos
  → verify
  → PR de integração
  → merge/deploy/smokes públicos sem dados
  → gate manual explícito
```

Não usar App Factory, Factory Runs, subagentes ou orquestração salvo autorização explícita da issue. Nunca publicar dados acadêmicos reais, identificadores remotos, secrets, bookmarks, payloads ou screenshots acadêmicos.
