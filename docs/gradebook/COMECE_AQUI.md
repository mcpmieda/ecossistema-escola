# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.** Issues-pai são acompanhamento; integrações rodam somente pela issue integradora correspondente.

## Onda 23 — produção controlada concluída

| Etapa           | Issue | Resultado                                             |
| --------------- | ----: | ----------------------------------------------------- |
| Recurso/binding |  #380 | D1 produtivo único + `GRADEBOOK_D1`, gate OFF         |
| Migrations      |  #381 | 0001–0004, schema 4 / 25, pendentes 0                 |
| Smoke           |  #382 | 5/5 passos verdes, corpus sintético restaurado a zero |
| Integração      |  #383 | memória canônica + readiness V2, sem nova operação D1 |

SHA/deployment testado pelo smoke: `2fdefa87f186e84ed40637437d4b0199baff82c6`.

## Onda 24 — pré-piloto até schema 5

| Etapa                          |    Issue/PR | Resultado                                                        |
| ------------------------------ | ----------: | ---------------------------------------------------------------- |
| Revisão de escopo              | #394 / #397 | sessão V2 classificada como bloqueio; demais limites controlados |
| Durabilidade de código         | #395 / #398 | store D1 cross-restart + migration 0005 integrados               |
| Gate de schema                 |        #399 | 0005 aplicada; schema remoto 5 / 27; pendentes 0; gate OFF       |
| Smoke produtivo do Conselho V2 |        #400 | separado e bloqueado até conclusão documental da #399            |

A BN-DEC-020 foi integrada pela #384 / PR #393. O primeiro piloto real continua definido como **escola inteira**, em janela privada/controlada e ainda com `imported-source` autoritativo durante a validação. A decisão não abre o gate nem executa o piloto por si só.

## Invariantes atuais

- `authorityMode: imported-source`;
- D1/binding produtivos presentes;
- schema remoto version 5 / 27 tabelas;
- production gate OFF entre janelas autorizadas;
- nenhum dado real usado na onda 23, na revisão #394 ou na migration #399;
- resíduo sintético após smoke: zero;
- piloto real: não iniciado;
- `native-engine`: não ativo;
- #347 permanece bloqueada.

## Readiness

- V1: memória histórica de preparação `prepared-for-manual-authorization`; não foi enfraquecido.
- V2: `production-infrastructure-smoke-validated-awaiting-private-pilot`.
- gates restantes: #400 sintética, piloto privado real e autoridade nativa separada.

## Revisão de escopo #394 — resolução atual

A revisão pré-piloto classificou as três limitações conhecidas sem executar runtime produtivo:

| Limitação                                                 | Classificação                                       | Consequência                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reconciliation_v2.case_store` process-local              | `allowed-with-controls`                             | restart invalida qualquer investigação/receita em voo; reabrir pelo registro de reconciliação durável, voltar a fail-closed e reinvestigar antes de qualquer correção |
| sessão/reunião institucional do Conselho V2 process-local | `blocks-pilot` histórico, removido no código/schema | #395 / PR #398 integrou o store D1; #399 aplicou a 0005; #400 deve validar o caminho produtivo sintético e o recovery                                                 |
| write administrativo da configuração de comparação        | `not-hit-by-authorized-pilot-scope`                 | o piloto usa somente configuração server-side já resolvida; nenhuma alteração administrativa de configuração faz parte da janela autorizada                           |

Não foi identificado outro hard stop obrigatório para abrir o piloto integral além da durabilidade cross-restart do Conselho V2. O desempate do Conselho sem identidade formal de diretor continua fail-closed e não integra o escopo obrigatório do piloto porque votação é opcional e nenhuma identidade/capability nova pode ser inventada.

### Controles obrigatórios da reconciliação V2

- nunca tratar o case store process-local como histórico institucional durável;
- se houver restart/deploy durante investigação, descartar a receita/case em voo e executar nova inspeção a partir da reconciliação durável;
- a nova inspeção retorna ao estado fail-closed até nova evidência suficiente;
- correção determinística não atravessa restart: registrar prova e executar somente depois de revalidar inputs/CAS no processo corrente;
- `mismatch` com possível impacto acadêmico continua bloqueando liberação/fechamento;
- ocorrência de correção aplicada continua registrada pelo planner/executor e Auditoria oficiais.

### Controle da configuração de comparação

Durante o piloto, a configuração proporcional fica congelada na configuração server-side aplicável no início da janela — inclusive o default canônico `enabled: true` quando não houver linha aplicável. O operador não tenta alterar configuração por cliente, banco manual ou caminho ad hoc. Se surgir necessidade institucional de alterar essa configuração durante o piloto, a janela para antes da mudança e nasce uma issue própria.

## Próximo passo

1. concluir/integrar a memória canônica da #399;
2. executar **#400 — smoke sintético produtivo do Conselho V2 + recovery para resíduo zero**, terminando com gate OFF;
3. somente depois abrir uma **issue separada de autorização/execução do piloto privado da escola inteira**, mantendo `imported-source`;
4. após piloto/reconciliação e contrato de autoridade por escopo, seguir para #347 conforme BN-DEC-020.

A #399 não autoriza o piloto e não executou smoke de sessão. Nenhuma janela com dados reais começa antes da #400 verde e de autorização própria do piloto.

## Fluxo

```text
issue [PRONTA]
  → branch curta
  → um PR
  → npm run verify
  → handoff

frente verde
  → integradora quando aplicável
  → merge fixado
  → testes/docs mínimos
  → verify
  → PR de integração
  → merge/deploy/smokes públicos sem dados
  → gate manual explícito
```

Não usar App Factory, Factory Runs, subagentes ou orquestração salvo autorização explícita da issue. Nunca publicar dados acadêmicos reais, identificadores remotos, secrets, bookmarks, payloads ou screenshots acadêmicos.
