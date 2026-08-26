# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge

## Estado

A reconstrução após a interrupção do Codex foi concluída e publicada na branch.

- D1 `banco-notas-homologation`: migrations `0001`–`0007` homologadas remotamente.
- Run D1 final: `32981705701` — success.
- Sync final remoto: desligado.
- Adapter Graph: backend-only, com upload, share por OID, metadata, download, SHA-256 local, reanálise OOXML, revoke/delete e compensação.
- Target Graph: fail-closed por configuração, sem IDs fictícios.
- Round-trip sintético: `serializer → Graph boundary → download → SHA-256 → analyzer` implementado.
- Microsoft/Entra/Graph/SharePoint real: ainda não homologado externamente.
- Produção: intocada.

## Pendente imediato

1. obter CI verde para o HEAD corrente;
2. corrigir qualquer falha sem enfraquecer regras;
3. atualizar o corpo do PR #52 com HEAD/run/contagem final;
4. manter PR draft e sync off.

## Baselines conhecidas

- `32981711631` — CI verde do bloco D1 no commit `2467240`;
- `32985041877` — falha intermediária Graph por mock sem `download`, já corrigida;
- `32985538704` — execução de CI criada durante o fechamento Graph.

## Bloqueios externos

- integração Microsoft real requer sessão/credencial administrativa de homologação apropriada;
- atomicidade por binding D1 real requer runtime Cloudflare de homologação autorizado;
- browser QA requer ambiente navegável apropriado.

## Não fazer

- não fazer merge;
- não tirar o PR de draft;
- não tocar D1/Pages de produção;
- não habilitar sync sem gate completo;
- não registrar secrets;
- não usar compartilhamento anônimo;
- não declarar Graph/SharePoint real homologado sem execução comprovada.
