# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026 — retomada após interrupção do Codex
Branch: `feat/banco-de-notas-foundation`
PR: `#52` — open, draft, sem merge
HEAD técnico antes deste checkpoint: `dc59860e729ef222c1aa8fecc203025125859109`
Última baseline D1 comprovada: run `32981705701` — success no HEAD `2467240`
Última CI verde anterior ao bloco Graph: run `32981711631` — success no HEAD `2467240`

## Objetivo do bloco atual

Fechar a fundação técnica corrente, preservar a homologação remota das migrations `0001`–`0007` e concluir a preparação backend-only Graph/SharePoint com round-trip XLSX verificável, sem tocar produção e mantendo sync desligado.

## Concluído

- [x] PR #52 confirmado open + draft + sem merge.
- [x] CI normal verde no bloco D1.
- [x] D1 `banco-notas-homologation` reutilizado, sem banco paralelo.
- [x] Migrations `0001`–`0007` validadas no D1 remoto.
- [x] Migration `0007` comprovou bloqueio de sync sem Entra OID e unicidade do OID.
- [x] Smoke remoto ampliado comprovou lock de troca de OID e de inativação durante sync temporário.
- [x] Estado final do smoke remoto comprovado com `sync_enabled=0`.
- [x] Gateway Graph backend-only existente recuperado do remoto após a interrupção do Codex.
- [x] Diff local perdido do bloco Graph reconstruído canonicamente no GitHub.
- [x] Metadata e download Graph separados em operações distintas.
- [x] SHA-256 movido para a orquestração e calculado localmente sobre os bytes realmente baixados.
- [x] Reanálise do workbook baixado tornou-se gate obrigatório antes da auditoria de sucesso.
- [x] Compensação cobre falha de metadata, tamanho baixado, hash e reanálise.
- [x] Target Graph preparado por `BANCO_NOTAS_GRAPH_DRIVE_ID` + `BANCO_NOTAS_GRAPH_PARENT_ITEM_ID`, sem IDs fictícios e com resolução fail-closed.
- [x] `.env.example` contém somente os nomes das novas configurações, sem valores reais.
- [x] Teste integrado criado para `serializer → Graph boundary → download → SHA-256 → analyzer` usando workbook genérico sintético real.
- [x] Nenhuma chamada Graph real, alteração SharePoint, alteração Entra ou deploy de produção foi executada na retomada.

## Em andamento

- [ ] Fechar a CI normal correspondente ao bloco Graph reconstruído.
- [ ] Corrigir qualquer falha real da baseline sem enfraquecer regras.
- [ ] Atualizar `BANCO_NOTAS_IMPLEMENTATION_STATE.md`, `BANCO_NOTAS_HANDOFF.md`, evidência D1, `PROJECT_STATE.md`, `VERIFICATION.md` e corpo do PR #52 com os dados correntes.

## Próxima ação exata

1. localizar a CI disparada após este checkpoint;
2. exigir formatting, lint, typecheck, semantic contract, testes e build verdes;
3. se houver falha, corrigir a causa e repetir até verde;
4. consolidar documentação e corpo do PR;
5. manter PR draft, sync off e produção untouched;
6. Microsoft externo só retoma quando existir sessão/credencial administrativa de homologação apropriada.

## Estado dos ambientes

### GitHub

- Repositório: `mcpmieda/ecossistema-escola`.
- Branch: `feat/banco-de-notas-foundation`.
- PR #52: open, draft, base `main`.
- Baseline D1/CI comprovada antes do Graph: `2467240b53bf3bbc5996905ba940b544cb35f266`.
- Run D1 final do bloco de identidade: `32981705701` — success.
- CI correspondente ao bloco D1: `32981711631` — success; produção skipped.
- Execução intermediária Graph `32985041877` / run #708 falhou em typecheck porque o mock antigo ainda não possuía `download`; isso ocorreu antes da atualização do teste e foi corrigido nos commits posteriores.

### Cloudflare

- D1 de homologação: `banco-notas-homologation`.
- Migrations remotas: `0001`–`0007` comprovadas.
- Run `32981705701`: success.
- Sync final: desligado.
- Nenhum D1/Pages de produção alterado.

### Microsoft / Entra

- A sessão anterior auditada pelo Codex não possuía CLI/credencial/sessão administrativa Microsoft disponível.
- Nenhum app registration, scope, audience, permissão ou tenant foi alterado.
- Audience/scope reais continuam bloqueio para exposição do add-in.

### Graph / SharePoint

- Adapter concreto backend-only cobre upload XLSX, share individual autenticado por OID, metadata, download, revoke e delete.
- Orquestração calcula SHA-256 localmente após download e exige reanálise antes de sucesso.
- Targets Graph permanecem sem valores no repositório e resolvem fail-closed.
- Nenhuma chamada Graph real nem alteração SharePoint foi realizada.

## Recursos criados ou alterados nesta retomada

| Recurso | Ambiente | Estado |
| --- | --- | --- |
| `server/banco-notas/teacher-model-graph.ts` | Git/branch | download/hash/reanálise e compensação reconstruídos |
| `server/banco-notas/teacher-model-graph-gateway.ts` | Git/branch | metadata/download separados + target fail-closed |
| `server/env.ts` | Git/branch | target Graph opcional declarado |
| `.env.example` | Git/branch | nomes das configs Graph sem valores |
| `tests/banco-notas-teacher-model-graph.test.ts` | Git/branch | falhas e compensações ampliadas |
| `tests/banco-notas-teacher-model-graph-gateway.test.ts` | Git/branch | lifecycle separado + target fail-closed |
| `tests/banco-notas-teacher-model-graph-roundtrip.test.ts` | Git/branch | round-trip XLSX sintético integrado |

Nunca registrar secrets.

## Commits relevantes

### Bloco anterior preservado

- `2bb0750` — fechar baseline da CI do Banco de Notas e criar checkpoint persistente.
- `a516fae` — registrar CI verde antes da operação D1.
- `2467240` — fechar invariantes Entra no D1 remoto.

### Retomada após interrupção

- `7bd1929` — exigir download/hash/reanálise na orquestração Graph.
- `c77c599` — separar metadata e download no gateway Graph.
- `dee0d54` — adicionar target Graph fail-closed ao RuntimeEnv.
- `e6efc07` — declarar nomes das configurações Graph no `.env.example`.
- `979f063` — atualizar lifecycle/teste do gateway.
- `74bc4d6` — atualizar orquestração e compensações nos testes.
- `dc59860` — adicionar round-trip XLSX integrado ao boundary Graph.

## CIs / workflows

- `32981035469` — success — CI completa no commit `2bb0750`; produção skipped.
- `32981239012` — success — D1 remoto com migrations `0001`–`0007` e smokes.
- `32981705701` — success — locks de OID/status e estado final sync off.
- `32981711631` — success — CI do bloco D1; produção skipped.
- `32985041877` — failure intermediária — typecheck em mock antigo sem `download`; corrigido depois.

## Problemas encontrados

- A interrupção ocorreu depois de alterações Graph/docs locais e antes do commit/push; essas alterações não existiam no HEAD remoto `2467240`.
- O checkpoint fornecido permitiu reconstruir a intenção sem inventar estado Microsoft externo.
- Uma CI intermediária executou antes da atualização do teste e detectou corretamente a ausência do novo método `download` no mock antigo.

## Decisões técnicas preservadas

- Graph continua backend-only.
- SharePoint/OneDrive continuam destinados a arquivos/modelos e versões, não ao estado transacional.
- Hash do workbook é calculado localmente sobre o conteúdo efetivamente baixado.
- Sucesso de compartilhamento não é auditado antes da reanálise OOXML do arquivo recuperado.
- Falha após upload/share exige compensação explícita.
- Configuração Graph sem drive/pasta real falha fechado.
- Sync continua desligado até gate end-to-end completo.

## Bloqueios externos

- Microsoft/Entra/Graph/SharePoint real continua bloqueado até existir sessão/credencial de homologação apropriada neste ambiente.
- Atomicidade remota por `D1Database` binding ainda requer runtime Cloudflare de homologação autorizado; não ampliar permissões apenas para fabricar a prova.
- Browser QA requer ambiente navegável apropriado.

## Não fazer ao retomar

- não fazer merge;
- não tirar o PR de draft;
- não tocar produção, D1 de produção ou Pages de produção;
- não habilitar sync sem gate completo;
- não usar compartilhamento anônimo;
- não registrar ou persistir tokens/secrets;
- não usar golden masters privados como produto ou fixture;
- não ampliar permissões sem necessidade comprovada;
- não declarar Graph/SharePoint real homologado enquanto não houver execução externa comprovada.

## Como retomar

1. Confirmar HEAD do PR e a CI mais recente.
2. Fechar qualquer falha da CI do bloco Graph.
3. Atualizar documentação/evidências e corpo do PR com os números finais.
4. Se Microsoft continuar indisponível, avançar em trabalho independente seguro em vez de simular integração externa.
5. Para Microsoft real, autenticar ambiente administrativo de homologação com menor privilégio e então executar upload/share/download/reanálise real.
