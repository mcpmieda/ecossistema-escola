# Banco de Notas — Change plan GO-LIVE V1

## Ordem

1. Registrar main SHA, deployment atual, configuração/bindings e distribuição do add-in.
2. Exportar/snapshot D1 aplicável. O inventário inicial encontrou somente `banco-notas-homologation`; produção deverá usar banco separado.
3. Criar D1 production, aplicar migrations 0001–0008 e conferir schema; flags 0008 nascem 0.
4. Vincular `BANCO_NOTAS_DB`; configurar audience/scope e habilitar apenas context/preflight. Deploy RC com sync e commit route OFF.
5. Smoke administrativo read-only; rollback imediato ao deployment anterior se houver regressão.
6. Distribuir add-in ao menor piloto inequívoco. Validar Excel Online/NAA/context/preflight.
7. Registrar exatamente um model elegível. Habilitar commit route, depois sync; provar non-pilot denial.
8. First-write de um campo, retry idempotente, conflito stale e kill-switch drill.
9. Expandir 1 campo → vários campos → vários alunos → turma/componente piloto; somente cohort ready.

Downtime esperado: nenhum. Rollback runtime: deployment Pages anterior. Rollback funcional: sync off + revogar cohort; história é preservada.
