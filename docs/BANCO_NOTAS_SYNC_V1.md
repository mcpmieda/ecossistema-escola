# Banco de Notas — Sync V1

## Arquitetura

`Excel Online → NAA 1.1 → contexto → detecção local → preflight → commit → D1 batch → attempts/read models`.

O cliente fornece somente identidade versionada do workbook, endereço/campo mapeado, baseline e novo valor. O servidor resolve teacher model, versão, fonte e grade key. Nenhum `teacherModelId`, `sourceId`, `gradeKey` ou actor é aceito do cliente.

## Gates

1. bearer v2: issuer, tenant, audience, scope, azp, lifetime e OID;
2. OID mapeado a professor interno ativo e ownership do modelo;
3. identidade exata e versão mais recente do workbook;
4. modelo conectado e sync individual habilitado;
5. fonte `linked_teacher_model` autoritativa, vigente, ativa, mesma environment e sync habilitado;
6. assignment ativo correspondente à turma/componente extraídos do mapping canônico;
7. configuração global `sync_enabled=1` e `commit_route_enabled=1`;
8. elegibilidade explícita e vigente em `sync_pilot_eligibility`;
9. mapping exato server-side e baseline event/sequence atual;
10. lote estrito de 1–500 mudanças, sem duplicata, fórmula ou over-posting.

O trigger `grade_events_sync_v1_guards` repete os gates mutáveis dentro do mesmo `D1Database.batch()` que grava eventos, snapshots e o attempt lógico.

## Idempotência e concorrência

`requestId` identifica a operação lógica. O payload integral é hasheado. Retry idêntico retorna `duplicate` e cria somente uma observação append-only; não cria evento nem altera snapshot. Mesmo ID com payload diferente retorna conflito. Baseline stale rejeita o lote inteiro. Não existe force overwrite.

## Observabilidade

- `sync_attempts`: uma linha append-only por tentativa, com `requestId` estável entre retries;
- `sync_attempt_invocations`: observações append-only de retries duplicados;
- `/v1/sync/attempts` e detalhe: status, contagens, motivo, duração e IDs internos;
- `/v1/sync/readiness`: classificação automatizada `ready`, `blocked`, `needs_attention`;
- Acompanhamento e Central exibem attempts sem valores de nota;
- Central deriva `sync_conflict`, `sync_failed` e `sync_rejected_stale`.

O ledger armazena actor interno, nunca OID externo, token ou payload bruto de notas.

## Contratos

- `shared/banco-notas-sync.ts`;
- `api/banco-notas-sync-v1.openapi.yaml`;
- `infra/banco-notas/d1/migrations/0008_banco_notas_sync_v1.sql`;
- `docs/BANCO_NOTAS_SYNC_V1_THREAT_MODEL.md`;
- `docs/BANCO_NOTAS_SYNC_V1_RECOVERY.md`.
