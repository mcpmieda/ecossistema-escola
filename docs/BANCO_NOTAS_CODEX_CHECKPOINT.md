# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge

## Estado essencial

- D1 `banco-notas-homologation`: migrations `0001`–`0007` homologadas.
- Run D1 final: `32981705701` — success.
- Sync final: off.
- Graph backend-only: upload/share por OID/metadata/download/SHA-256 local/reanálise/revoke/delete/compensação.
- Target Graph: fail-closed.
- Round-trip sintético XLSX: `serializer → Graph boundary → download → SHA-256 → analyzer`.
- Microsoft real: ainda não homologado externamente.
- Produção: intocada.

## Próxima ação

1. confirmar HEAD do PR;
2. localizar a CI desse HEAD;
3. corrigir até verde;
4. atualizar o corpo do PR sem alterar arquivos;
5. manter draft, no merge e sync off.
