# Banco de Notas — Sync V1 threat model

## Invariantes

1. Kill switch vence qualquer outra configuração. 2. Elegibilidade piloto é obrigatória e default-deny. 3. Ownership é revalidado no commit. 4. Modelo, assignment, source e versão são revalidados. 5. Mapping e grade key são autoridade do servidor. 6. Zero difere de ausência. 7. Retry é idempotente. 8. Conflito rejeita a requisição inteira. 9. Não há overwrite silencioso. 10. Baseline stale é rejeitado. 11. Sync/piloto off produz zero writes. 12. Logs e attempts não guardam token, OID externo ou valores de nota.

## Ameaças e controles

| Ameaça                                     | Prevenção                                                | Detecção           | Resposta             | Teste                   |
| ------------------------------------------ | -------------------------------------------------------- | ------------------ | -------------------- | ----------------------- |
| token/replay                               | bearer v2, tenant/audience/scope/azp/lifetime; requestId | 401/attempt        | rejeitar             | token negativo + retry  |
| cross-tenant/ownership                     | tenant fixo e OID ligado ao professor                    | `OWNERSHIP_DENIED` | zero write           | owner incorreto         |
| workbook/model/version stale               | identidade governada e latest version                    | reason code        | reanalisar           | versão alterada         |
| forged ID/gradeKey/mapping                 | cliente envia célula/campo; servidor resolve gradeKey    | `MAPPING_MISMATCH` | rejeitar tudo        | mapping forjado         |
| over-posting/oversize/malformed            | Zod strict, 500 changes, body limitado                   | 400                | rejeitar             | payload extra/max+1/NaN |
| fórmula, zero e ausência                   | valor normalizado; ausência exige null                   | `INVALID_CHANGE`   | rejeitar             | zero/ausência           |
| timeout/duplicate retry                    | attempt lookup por requestId + payload hash              | duplicate/conflict | consultar outcome    | network unknown/storm   |
| duas abas/concurrent writes                | baseline event+sequence e trigger no batch               | `BASELINE_STALE`   | reanalisar           | dois commits            |
| source/assignment/model/switch/pilot mudam | trigger transacional revalida gates                      | reason code        | kill switch/rejeição | mutação após preflight  |
| log leak                                   | result_json contém só contagens, códigos e event IDs     | auditoria de logs  | sanitizar/rotacionar | busca por JWT/OID/nota  |

O commit usa um único `D1Database.batch()`. Triggers executados dentro do batch abortam evento, snapshot e ledger juntos.
