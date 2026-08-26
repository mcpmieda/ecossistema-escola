# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge

## Estado estabilizado

Reconstrução do bloco Codex publicada. **Não alterar este arquivo novamente antes de fechar a CI do HEAD corrente.**

- D1 homologation: migrations `0001`–`0007` comprovadas.
- Run D1 final: `32981705701` — success.
- Sync final: off.
- Graph backend-only: upload/share OID/metadata/download/SHA-256 local/reanálise/revoke/delete/compensação.
- Graph target: fail-closed, sem IDs fictícios.
- Round-trip sintético XLSX no boundary Graph: implementado.
- Microsoft real: não homologado externamente.
- Produção: intocada.

## Próxima ação

1. confirmar HEAD do PR;
2. localizar a CI correspondente;
3. corrigir qualquer falha até verde;
4. atualizar o corpo do PR sem mover o HEAD;
5. manter draft, no merge, sync off e produção untouched.

## Bloqueios externos

- autenticação Microsoft de homologação;
- runtime Cloudflare de homologação para prova por binding D1;
- ambiente navegável para browser QA.
