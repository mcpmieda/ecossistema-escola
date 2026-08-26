# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026 — retomada após interrupção do Codex
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge
HEAD técnico validado para CI antes deste checkpoint: `042fd368bcf44811c2dfb1c1275c4a8f5587bdbd`
CI final Graph: `32985538704` / run `#709` — queued no momento deste registro
Última baseline D1 comprovada: run `32981705701` — success no HEAD `2467240`
Última CI verde comprovada: `32981711631` — success no HEAD `2467240`

## Objetivo do bloco atual

Fechar a fundação técnica corrente, preservar a homologação remota das migrations `0001`–`0007` e concluir a preparação backend-only Graph/SharePoint com round-trip XLSX verificável, sem tocar produção e mantendo sync desligado.

## Concluído

- [x] PR #52 confirmado open + draft + sem merge.
- [x] D1 `banco-notas-homologation` reutilizado, sem banco paralelo.
- [x] Migrations `0001`–`0007` validadas no D1 remoto.
- [x] Migration `0007` comprovou bloqueio de sync sem Entra OID e unicidade do OID.
- [x] Smoke remoto comprovou lock de troca de OID e de inativação durante sync temporário.
- [x] Estado final remoto comprovado com `sync_enabled=0`.
- [x] Diff local perdido do bloco Graph reconstruído canonicamente no GitHub.
- [x] Metadata e download Graph separados.
- [x] SHA-256 calculado localmente sobre os bytes realmente baixados.
- [x] Reanálise OOXML tornou-se gate obrigatório antes da auditoria de sucesso.
- [x] Compensação cobre falha de metadata, tamanho baixado, hash e reanálise.
- [x] Target Graph preparado por `BANCO_NOTAS_GRAPH_DRIVE_ID` + `BANCO_NOTAS_GRAPH_PARENT_ITEM_ID`, sem IDs fictícios e fail-closed.
- [x] Teste integrado criado para `serializer → Graph boundary → download → SHA-256 → analyzer` usando XLSX genérico real.
- [x] `BANCO_NOTAS_IMPLEMENTATION_STATE.md`, `BANCO_NOTAS_HANDOFF.md` e evidência D1 atualizados para migrations `0001`–`0007` e estado Graph corrente.
- [x] Nenhuma chamada Graph real, alteração SharePoint, alteração Entra, merge ou deploy de produção foi executado.

## Em andamento

- [ ] CI `32985538704` / #709 do HEAD `042fd368...`.
- [ ] Se a CI falhar, corrigir a causa sem enfraquecer regras e repetir.
- [ ] Atualizar corpo do PR #52 com resultado final e contagem real de testes.

## Próxima ação exata

1. acompanhar o run `32985538704`;
2. exigir formatting, lint, typecheck, semantic contract, testes e build verdes;
3. corrigir qualquer falha real;
4. atualizar o corpo do PR com HEAD/run/contagem final;
5. manter PR draft, sync off e produção untouched;
6. Microsoft externo só retoma quando existir sessão/credencial administrativa de homologação apropriada.

## Estado dos ambientes

### GitHub

- Repositório: `mcpmieda/ecossistema-escola`.
- Branch: `feat/banco-de-notas-foundation`.
- PR #52: open, draft, base `main`.
- Run intermediário `32985041877` / #708 falhou em typecheck porque um mock antigo ainda não possuía `download`; corrigido nos commits posteriores.
- Run final corrente: `32985538704` / #709 no HEAD `042fd368...`.

### Cloudflare

- D1: `banco-notas-homologation`.
- Migrations remotas: `0001`–`0007` comprovadas.
- Run `32981705701`: success.
- Sync final: desligado.
- Nenhum D1/Pages de produção alterado.

### Microsoft / Entra

- Na sessão anterior do Codex não havia CLI/credencial/sessão administrativa Microsoft disponível.
- Nenhum app registration, scope, audience, permissão ou tenant foi alterado.
- Audience/scope reais continuam bloqueio para exposição do add-in.

### Graph / SharePoint

- Adapter concreto backend-only cobre upload XLSX, share individual autenticado por OID, metadata, download, revoke e delete.
- Orquestração calcula SHA-256 localmente após download e exige reanálise antes de sucesso.
- Targets Graph permanecem sem valores no repositório e resolvem fail-closed.
- Nenhuma chamada Graph real nem alteração SharePoint foi realizada.

## Recursos alterados na retomada

| Recurso | Estado |
| --- | --- |
| `server/banco-notas/teacher-model-graph.ts` | download/hash/reanálise + compensação |
| `server/banco-notas/teacher-model-graph-gateway.ts` | metadata/download separados + target fail-closed |
| `server/env.ts` | target Graph opcional |
| `.env.example` | nomes das configs Graph sem valores |
| `tests/banco-notas-teacher-model-graph.test.ts` | compensações ampliadas |
| `tests/banco-notas-teacher-model-graph-gateway.test.ts` | lifecycle e target fail-closed |
| `tests/banco-notas-teacher-model-graph-roundtrip.test.ts` | round-trip XLSX integrado |
| `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md` | atualizado |
| `docs/BANCO_NOTAS_HANDOFF.md` | atualizado |
| `docs/BANCO_NOTAS_D1_HOMOLOGATION_VERIFICATION_2026-08-26.md` | atualizado para 0007 |

Nunca registrar secrets.

## Commits relevantes da retomada

- `7bd1929` — exigir download/hash/reanálise na orquestração Graph.
- `c77c599` — separar metadata e download no gateway Graph.
- `dee0d54` — adicionar target Graph fail-closed ao RuntimeEnv.
- `e6efc07` — declarar nomes das configurações Graph no `.env.example`.
- `979f063` — atualizar lifecycle/teste do gateway.
- `74bc4d6` — atualizar orquestração e compensações nos testes.
- `dc59860` — adicionar round-trip XLSX integrado ao boundary Graph.
- `3bf54f0` — consolidar retomada do checkpoint.
- `e35c447` — atualizar implementation state.
- `d30229e` — atualizar handoff.
- `042fd36` — registrar homologação remota da migration 0007.

## CIs / workflows

- `32981035469` — success — CI completa no commit `2bb0750`; produção skipped.
- `32981239012` — success — D1 remoto com migrations `0001`–`0007` e smokes.
- `32981705701` — success — locks de OID/status e estado final sync off.
- `32981711631` — success — CI do bloco D1; produção skipped.
- `32985041877` — failure intermediária — mock antigo sem `download`; corrigido depois.
- `32985538704` — queued — CI final do bloco Graph no HEAD `042fd368...` no momento deste checkpoint.

## Bloqueios externos

- Microsoft/Entra/Graph/SharePoint real: requer sessão/credencial administrativa de homologação apropriada.
- Atomicidade remota por `D1Database` binding: requer runtime Cloudflare de homologação autorizado.
- Browser QA: requer ambiente navegável apropriado.

## Não fazer ao retomar

- não fazer merge;
- não tirar o PR de draft;
- não tocar produção, D1 de produção ou Pages de produção;
- não habilitar sync sem gate completo;
- não usar compartilhamento anônimo;
- não registrar ou persistir tokens/secrets;
- não usar golden masters privados como produto ou fixture;
- não ampliar permissões sem necessidade comprovada;
- não declarar Graph/SharePoint real homologado sem execução externa comprovada.

## Como retomar

1. Confirmar HEAD do PR e o run #709.
2. Fechar qualquer falha da CI.
3. Atualizar o corpo do PR com a baseline final.
4. Se Microsoft continuar indisponível, avançar em trabalho funcional independente seguro em vez de simular integração externa.
5. Para Microsoft real, autenticar ambiente administrativo de homologação com menor privilégio e executar upload/share/download/reanálise real.
