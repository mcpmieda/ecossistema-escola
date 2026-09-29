# Motivos de recusa na auditoria — aplicação produtiva 0023

Em 29/09/2026, por pedido do responsável (motivos de recusa e detalhes de entrada para orientar
famílias), a migration `0023_audit_detail_v1.sql` foi aplicada no Supabase `ecossistema-escola`
como **`20260929071319`** (`student_portal_audit_detail_v1`). Foi usado o SQL do blob
**`b3ddacf8a38848968dd64d4a8349765dcd870178`**, removendo somente o `BEGIN` e o `COMMIT`
externos, pois a operação de migração já executa em transação.

Antes da aplicação passaram localmente, no head da entrega: lint, typecheck, a suíte `vitest`
completa e `npm run test:student-portal-postgres` em PostgreSQL descartável (226 testes, com a
0023 aplicada nos fixtures).

## Pós-verificação técnica

- Histórico confirmou a versão e o nome acima.
- `student_portal.audit_event.detail_json` existe como `jsonb` opcional, com a restrição
  `student_portal_audit_detail_v1` (objeto de até 1024 bytes).
- Nenhuma linha existente foi alterada: 3130 eventos, todos com `detail_json` nulo (sem backfill).
- `student_portal_app` pode inserir e consultar a nova coluna pelos privilégios da tabela.
- O Worker publicado antes desta migration não usa a coluna; a ordem é migration antes do
  Worker que grava o detalhe.

## Estado neste registro

**Migration aplicada e verificada; publicação do Worker pendente.** O merge e o deploy oficial
seguem na PR da entrega. A validação funcional no ambiente real com o responsável permanece
distinta destas provas técnicas.
