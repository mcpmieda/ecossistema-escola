# Banco de Notas — Change plan GO-LIVE V1

## Ordem

1. Criar o RC a partir da `main` verde e registrar SHA, versão `1.0.0.0` do add-in e rollback de código/runtime.
2. Executar `Banco de Notas production control plane` com `snapshot`; registrar deployment atual, configuração/bindings, inventário D1 e distribuição vigente do add-in.
3. Executar `deploy-read-only` somente com SHA do RC, deployment anterior e confirmação `DEPLOY_BANCO_NOTAS_READ_ONLY` exatos. O workflow recusa drift e bindings de recursos inesperados.
4. Criar ou reutilizar univocamente `banco-notas-production`, exportar antes da primeira migration, aplicar 0001–0008 e provar `sync_enabled=0`, `commit_route_enabled=0`, piloto habilitado = 0 e oito migrations.
5. Vincular somente `BANCO_NOTAS_DB`; configurar audience/scope/context e preservar variáveis Pages existentes com `keep_vars`. Deploy do RC com sync e commit route OFF.
6. Smoke administrativo read-only; rollback imediato ao deployment anterior se houver regressão.
7. Identificar o piloto exclusivamente pela readiness canônica e confirmação institucional; enquanto isso, o alvo permanece `UNRESOLVED` e não deve ser inferido.
8. Distribuir add-in ao menor piloto inequívoco. Validar Excel Online/NAA/context/preflight.
9. Registrar exatamente um model elegível. Habilitar commit route, depois sync; provar non-pilot denial.
10. First-write de um campo, retry idempotente, conflito stale e kill-switch drill.
11. Expandir 1 campo → vários campos → vários alunos → turma/componente piloto; somente cohort ready.

Downtime esperado: nenhum. Rollback runtime: deployment Pages anterior. Rollback funcional: sync off + revogar cohort; história é preservada.
