# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.** Issues-pai servem de acompanhamento; issues `[BLOQUEADA]` não devem ser iniciadas antes das dependências declaradas.

## Estado atual — Etapa 3/5

A implantação institucional está na **Etapa 3/5**. O produto já possui os módulos funcionais principais; o trabalho corrente é migrar o storage oficial para PostgreSQL via Hyperdrive e depois concluir o piloto integral.

`authorityMode: imported-source` permanece obrigatório durante toda esta etapa.

## Fila executável

| Ordem | Issue | Estado                  | Trabalho                                             |
| ----: | ----: | ----------------------- | ---------------------------------------------------- |
|     1 |  #592 | concluída               | adapters PostgreSQL + dual verification              |
|     2 |  #594 | concluída               | backfill privado D1 → PostgreSQL + paridade integral |
|     3 |  #595 | concluída               | cutover PostgreSQL + janela de rollback D1           |
|     4 |  #406 | **PRONTA**              | piloto integral da escola inteira no storage oficial |
|     5 |  #347 | **Etapa 4/5 bloqueada** | autoridade `native-engine` por escopo                |
|     6 |  #596 | **Etapa 5/5 bloqueada** | entrega institucional final                          |

A próxima issue executável é **#406**. Não iniciar #347 ou #596 por antecipação.

## Storage

- BN-DEC-021 substituiu BN-DEC-016 quanto ao storage físico principal futuro;
- PostgreSQL/Supabase via Hyperdrive `PROD_DB` é o storage oficial;
- schema produtivo `gradebook` já foi aplicado sem dados reais;
- D1 está preservado sem dual write como rollback durante a janela explícita;
- o histórico técnico D1 está preservado em `../../Aprendizados/`.

## Piloto integral

A #406 não foi descartada. Ela foi **pausada pela migração de storage** para que o corpus integral seja validado uma única vez no storage definitivo. Após #595, a #406 volta a ser o gate final da Etapa 3/5.

No piloto final devem permanecer válidos: importação 18/18 privada, idempotência, CAS/rollback, histórico, Auditoria, reconciliação, Desempenho, Boletins/snapshots/reprint, Relatórios, Conselho/restart e recovery, sem exposição de dados reais.

## Autoridade acadêmica

#347 permanece bloqueada até #406 concluir. Storage físico e autoridade acadêmica são decisões independentes. A migração para PostgreSQL **não** ativa `native-engine`.

## Readiness histórico

- V1: memória histórica de preparação `prepared-for-manual-authorization`; não foi enfraquecido.
- V2 histórico: `production-infrastructure-smoke-validated-awaiting-private-pilot`.
- Esses estados descrevem a preparação D1 anterior; a trilha executável atual é #592 → #594 → #595 → #406.

### Onda 24 — pré-piloto até schema 5

Esta seção é mantida como referência histórica de compatibilidade: a antiga onda 24 concluiu schema D1 5/27 e smoke/recovery do Conselho antes do piloto. A decisão posterior BN-DEC-021 mudou somente a tecnologia de storage alvo, preservando os contratos e aprendizados construídos nessa fase.

## Fluxo

```text
issue [PRONTA]
  → branch curta
  → um PR
  → npm run verify
  → CI
  → merge/deploy quando autorizado
  → evidência sanitizada
```

Não usar App Factory, Factory Runs, subagentes ou orquestração salvo autorização explícita. Nunca publicar dados acadêmicos reais, secrets, connection strings, payloads, hashes privados ou screenshots acadêmicos.
