# Banco de Notas — Sync V1 recovery

1. Acionar `sync_configuration.sync_enabled=0`; confirmar preflight `SYNC_DISABLED` e zero novos eventos.
2. Revogar `sync_pilot_eligibility.enabled` do cohort afetado.
3. Preservar `grade_events`, `sync_attempts` e audit; nunca apagar ou reescrever história.
4. Identificar release SHA, deployment ID, request IDs e intervalo de eventos.
5. Se runtime regrediu, promover o deployment Pages anterior; manter migrations forward-compatible.
6. Se dados divergiram, reconciliar por eventos compensatórios aprovados e nova sequência, nunca por delete/update de eventos.
7. Validar snapshots, attempts, Central, ownership e non-pilot denial antes de religar.

O backup pré-release é export D1 suportado, sanitizado e protegido; o rollback alvo é registrado no change plan.
