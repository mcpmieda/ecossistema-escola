# Banco de Notas — auditoria Entra read-only do add-in

Data: 27/08/2026

## Resultado

A auditoria read-only do tenant concluiu com `success_no_candidate`.

- Nome canônico consultado: `Ecossistema Escola - Banco de Notas Add-in Homologation`.
- Registrations correspondentes: `0`.
- Método de diretório utilizado: exclusivamente `GET /applications`.
- Autenticação: GitHub OIDC → workload federation Entra → Microsoft Graph.
- Audience do token Graph: confirmada.
- Role observada: `Application.ReadWrite.OwnedBy`.
- Run: `33092136016`.
- Artefato redigido: `banco-notas-addin-entra-readonly-audit-33092136016`.

A referência oficial de permissões do Microsoft Graph afirma explicitamente que `Application.ReadWrite.OwnedBy` pode listar todas as applications e service principals do tenant por `GET /applications` e `GET /servicePrincipals`; a limitação `OwnedBy` restringe as operações de escrita. Portanto, a contagem zero é conclusiva para o nome exato consultado.

## Invariantes comprovadas

- nenhuma application foi criada, atualizada ou excluída;
- nenhum service principal foi criado, atualizado ou excluído;
- nenhum consentimento, owner, redirect URI, scope, secret ou certificado foi alterado;
- nenhuma activation de produção ocorreu;
- endpoint público do add-in permaneceu desconectado;
- sync permaneceu `0`;
- PR #52 permaneceu open, draft e sem merge;
- IDs completos de tenant, maintenance identity ou applications não foram persistidos na evidência versionada.

## Próximo gate seguro

Como não há registration candidata, o próximo gate pode criar exatamente uma registration de homologação single-tenant, credential-free e sem permissões Graph, usando a identidade de manutenção já autorizada. Esse apply deve ser separado, idempotente, fail-closed, compensável e não pode publicar o add-in, conectar a rota pública ou habilitar sync.

## Referência externa

- Microsoft Graph permissions reference — `Application.ReadWrite.OwnedBy`.
