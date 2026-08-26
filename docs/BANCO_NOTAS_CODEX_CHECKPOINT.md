# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge

## Checkpoint congelado

A reconstrução do bloco interrompido está publicada. Não criar novos commits antes de fechar a CI do HEAD corrente.

- D1 `0001`–`0007`: homologado remotamente.
- Run D1 final: `32981705701` — success.
- Sync final: off.
- Graph backend-only: download + SHA-256 local + reanálise + compensação.
- Target Graph: fail-closed.
- Round-trip XLSX sintético no boundary Graph: implementado.
- Microsoft real: ainda não homologado.
- Produção: intocada.

## Próxima ação

Confirmar HEAD → localizar CI desse HEAD → corrigir até verde → atualizar corpo do PR sem alterar arquivos → manter draft/no merge/sync off.
