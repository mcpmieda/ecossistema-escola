# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026 — reconstrução do bloco Graph concluída
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge
HEAD atual: consultar o commit que contém este checkpoint
Última baseline D1 comprovada: `32981705701` — success no HEAD `2467240`
Última CI verde comprovada: `32981711631` — success no HEAD `2467240`

## Estado resumido

O trabalho perdido na interrupção do Codex foi reconstruído no GitHub. A migration `0007` está homologada no D1 remoto, o sync termina desligado e o boundary Graph backend-only agora possui download, SHA-256 local, reanálise OOXML e compensação completa. A integração Microsoft real continua não executada por falta de sessão/credencial administrativa de homologação no ambiente anterior.

## Concluído

- [x] migrations D1 `0001`–`0007` validadas remotamente;
- [x] OID Entra obrigatório/único e locks de identidade/status comprovados;
- [x] `sync_enabled=0` no estado final remoto;
- [x] metadata/download Graph separados;
- [x] SHA-256 calculado sobre bytes baixados;
- [x] reanálise OOXML antes de sucesso;
- [x] compensação revoke/delete para falhas;
- [x] target Graph fail-closed sem IDs fictícios;
- [x] teste integrado `serializer → Graph boundary → download → SHA-256 → analyzer`;
- [x] implementation state, handoff e evidência D1 atualizados;
- [x] PR continua draft, sem merge e sem produção;
- [x] nenhuma chamada Graph/SharePoint/Entra real nesta retomada.

## Pendente imediato

- [ ] CI verde do HEAD corrente;
- [ ] atualização final do corpo do PR com run e contagem de testes.

## Próxima ação exata

1. confirmar HEAD do PR;
2. localizar CI correspondente;
3. corrigir qualquer falha real até formatting/lint/typecheck/semantic/test/build verdes;
4. atualizar corpo do PR;
5. não mover produção nem habilitar sync.

## Bloqueios externos

- Microsoft/Entra/Graph/SharePoint real: requer autenticação administrativa de homologação apropriada;
- atomicidade por binding D1 real: requer runtime Cloudflare de homologação autorizado;
- browser QA: requer ambiente navegável apropriado.

## Não fazer ao retomar

- não fazer merge;
- não tirar o PR de draft;
- não tocar D1/Pages de produção;
- não habilitar sync sem gate completo;
- não usar compartilhamento anônimo;
- não registrar secrets;
- não usar golden masters privados como produto/fixture;
- não declarar integração Microsoft real homologada sem execução comprovada.

## Referências de execução

- `32981239012` — D1 migrations `0001`–`0007` e smokes — success;
- `32981705701` — D1 locks OID/status, sync final off — success;
- `32981711631` — CI do bloco D1 — success;
- `32985041877` — CI intermediária Graph; mock antigo sem `download` — corrigido;
- `32985538704` — CI criada durante o fechamento do bloco Graph.

## Commits funcionais reconstruídos

- `7bd1929` — download/hash/reanálise;
- `c77c599` — metadata/download separados;
- `dee0d54` — target Graph fail-closed;
- `e6efc07` — env names;
- `979f063` — gateway tests;
- `74bc4d6` — orchestration/compensation tests;
- `dc59860` — Graph XLSX round-trip;
- `e35c447` — implementation state;
- `d30229e` — handoff;
- `042fd36` — D1 evidence 0007.
