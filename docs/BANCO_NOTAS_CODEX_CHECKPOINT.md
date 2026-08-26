# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026 — reconstrução concluída
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge
HEAD atual: consultar o commit que contém este checkpoint
Última baseline D1 comprovada: run `32981705701` — success no HEAD `2467240`
Última CI verde comprovada: `32981711631` — success no HEAD `2467240`
CI Graph observada: `32985538704` / run `#709`, criada durante a reconstrução; a próxima retomada deve confirmar a execução correspondente ao HEAD corrente.

## Objetivo do bloco

Fechar a fundação técnica corrente, preservar a homologação remota das migrations `0001`–`0007` e concluir a preparação backend-only Graph/SharePoint com round-trip XLSX verificável, sem tocar produção e mantendo sync desligado.

## Concluído

- [x] PR #52 permanece open + draft + sem merge.
- [x] D1 `banco-notas-homologation` reutilizado, sem banco paralelo.
- [x] Migrations `0001`–`0007` validadas no D1 remoto.
- [x] Migration `0007` comprovou bloqueio de sync sem Entra OID, unicidade, lock de OID e lock de inativação.
- [x] Estado final remoto comprovado com `sync_enabled=0`.
- [x] Diff local perdido do bloco Graph reconstruído no GitHub.
- [x] Metadata e download Graph separados.
- [x] SHA-256 calculado localmente sobre os bytes realmente baixados.
- [x] Reanálise OOXML obrigatória antes da auditoria de sucesso.
- [x] Compensação cobre falha de metadata, tamanho baixado, hash e reanálise.
- [x] Target Graph preparado por `BANCO_NOTAS_GRAPH_DRIVE_ID` + `BANCO_NOTAS_GRAPH_PARENT_ITEM_ID`, fail-closed e sem IDs fictícios.
- [x] Teste integrado criado para `serializer → Graph boundary → download → SHA-256 → analyzer` usando XLSX genérico real.
- [x] `BANCO_NOTAS_IMPLEMENTATION_STATE.md`, `BANCO_NOTAS_HANDOFF.md` e evidência D1 atualizados.
- [x] Nenhuma chamada Graph real, alteração SharePoint, alteração Entra, merge ou deploy de produção foi executado.

## Em andamento

- [ ] Obter CI verde que cubra o HEAD corrente.
- [ ] Atualizar corpo do PR #52 com HEAD, run e contagem final de testes.

## Próxima ação exata

1. confirmar o HEAD do PR;
2. localizar a CI correspondente;
3. exigir formatting, lint, typecheck, semantic contract, testes e build verdes;
4. corrigir qualquer falha real sem enfraquecer regras;
5. atualizar o corpo do PR com a baseline final;
6. manter PR draft, sync off e produção untouched.

## Estado dos ambientes

### GitHub

- Repositório: `mcpmieda/ecossistema-escola`.
- Branch: `feat/banco-de-notas-foundation`.
- PR #52: open, draft, base `main`.
- `32985041877` / #708: falha intermediária em typecheck por mock antigo sem `download`; corrigido nos commits posteriores.
- `32985538704` / #709: execução criada durante a reconstrução Graph.

### Cloudflare

- D1: `banco-notas-homologation`.
- Migrations: `0001`–`0007` comprovadas remotamente.
- Run `32981705701`: success.
- Sync final: desligado.
- Nenhum D1/Pages de produção alterado.

### Microsoft / Entra

- A sessão anterior do Codex não possuía CLI/credencial/sessão administrativa Microsoft disponível.
- Nenhum app registration, scope, audience, permissão ou tenant foi alterado.
- Audience/scope reais continuam bloqueio para exposição do add-in.

### Graph / SharePoint

- Adapter concreto backend-only cobre upload XLSX, share individual autenticado por OID, metadata, download, revoke e delete.
- Orquestração calcula SHA-256 após download e exige reanálise antes de sucesso.
- Targets Graph permanecem sem valores no repositório e resolvem fail-closed.
- Nenhuma chamada Graph real nem alteração SharePoint foi realizada.

## Commits principais da reconstrução

- `7bd1929` — download/hash/reanálise na orquestração Graph.
- `c77c599` — metadata/download separados no gateway.
- `dee0d54` — target Graph fail-closed no RuntimeEnv.
- `e6efc07` — nomes das configurações Graph no `.env.example`.
- `979f063` — lifecycle/teste do gateway.
- `74bc4d6` — compensações nos testes.
- `dc59860` — round-trip XLSX integrado.
- `e35c447` — implementation state atualizado.
- `d30229e` — handoff atualizado.
- `042fd36` — evidência D1 atualizada para migration 0007.

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

1. Confirmar HEAD do PR e a CI mais recente.
2. Fechar qualquer falha da CI.
3. Atualizar o corpo do PR com a baseline final.
4. Se Microsoft continuar indisponível, avançar em trabalho funcional independente seguro.
5. Para Microsoft real, autenticar ambiente administrativo de homologação com menor privilégio e executar upload/share/download/reanálise real.
