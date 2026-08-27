# Banco de Notas — Codex Checkpoint

Última atualização: 27/08/2026 — retomada operacional
Branch: `feat/banco-de-notas-foundation`
HEAD: `6974ca51d3852189c6ba1db027033bdbf778835c`
PR: `#52` — open, draft, sem merge
CI: run `33027239078` — success; deploy e recovery de produção skipped
D1 homologation: run `33026452850` — success, vínculo sintético ao OID autorizado e sync `0`
M365 operation: run `33003875460` — success, readiness read-only

## Concluído

- [x] Checkout real recuperado e atualizado por fast-forward até o HEAD remoto do PR.
- [x] Alterações locais encontradas sobre o HEAD antigo preservadas no stash de segurança `safety-before-recover-pr52-2026-08-26`.
- [x] PR #52 confirmado open + draft; nenhum merge ou alteração de produção executado.
- [x] Último log da CI lido integralmente até a causa: `throw` dentro de `finally` em `tests/banco-notas-m365-storage-homologation.test.ts`.
- [x] Homologação D1 mais recente confirmada verde no run `32981705701`.
- [x] Readiness M365 mais recente confirmada verde no run `33003875460`.
- [x] Merge-base real com `origin/main` identificado como `a393589265378a1954325e504c4f12cbf63c5e14`.
- [x] Produção não foi alterada pelas execuções auditadas; jobs de deploy/recovery do run corrente ficaram skipped.
- [x] `no-unsafe-finally` corrigido sem desabilitar lint, remover cleanup ou mascarar o erro principal.
- [x] Os 6 commits mais recentes de `origin/main` foram incorporados por merge limpo.
- [x] Gate local completo aprovado: Prettier, lint, typecheck, semantic contract, 294/294 testes ativos, build, actionlint, sintaxe PowerShell e policy do Control Plane.
- [x] CI remota interna aprovada no run `33024306664`; deploy e recovery de produção skipped.
- [x] Round-trip real executou upload, metadata, download e cleanup no boundary dedicado.
- [x] Arquivo sintético removido com sucesso; pasta dedicada retida; nenhum share executado.
- [x] Divergência reproduzida: original `9588` bytes, metadata/download `21329` bytes e hash baixado diferente.
- [x] Diagnóstico OOXML comprovou preservação das partes do produto e injeção exclusiva de metadados SharePoint (`customXml`, custom properties e catálogos relacionados).
- [x] Gate fail-closed implementado: partes originais do produto idênticas, relações/content types originais preservados e apenas adições server-managed conhecidas aceitas.
- [x] Artefato XLSX diagnóstico `9628007563` excluído do GitHub após a análise.
- [x] Gate local pós-correção verde: 298/298 testes ativos, lint, typecheck, semantic contract, build, actionlint, PowerShell e Control Plane.
- [x] Storage M365 verde no run `33025586408`: pacote normalizado íntegro, OOXML reanalisado sem findings e cleanup confirmado.
- [x] Conta `GUI@escolaieda.com` confirmada no Entra como membro habilitado; UPN canônico e Object ID conferidos no perfil.
- [x] D1 remoto de homologação preparado no run `33026452850`: professor/modelo sintéticos ligados ao OID confirmado, estado `ready_to_share`, ambiente `homologation` e sync `0`.
- [x] Gate local pré-share aprovado: Prettier, lint, typecheck, semantic contract, 299/299 testes ativos, build, actionlint, PowerShell e Control Plane.
- [x] Share individual verde no run `33026888705`: OID exato, role `write`, login obrigatório, sem convite, `Anyone`, organização, grupo ou usuário novo adicional.
- [x] Integridade SharePoint normalizada e reanálise OOXML sem findings aprovadas antes da retenção temporária.
- [x] Primeira tentativa `33026678794` compensada: permissão revogada e XLSX removido após classificação conservadora de permissão preexistente.
- [x] Job one-shot retirado; CI `33027020137` verde e sem nova execução de share.
- [x] XLSX correto aberto visualmente no Excel Online; turma, componente e estudante sintéticos visíveis.

## Em andamento

- [ ] Entrar no Excel Online como `GUI@escolaieda.com`, confirmar acesso de edição e realizar a alteração sintética controlada.
- [x] Estado real recuperado em 27/08/2026: worktree limpo, branch local/remoto no mesmo HEAD, PR open/draft, CI verde e stash preservado sem aplicação.
- [x] Diferença atual para `origin/main` confirmada após fetch explícito: branch 3 commits atrás e 367 commits à frente.
- [x] Aba Microsoft anterior não permaneceu disponível no navegador interno; nenhuma sessão, credencial ou MFA foi inspecionada.

## Próxima ação exata

Reabrir o fluxo Microsoft no navegador interno e autenticar como `GUI@escolaieda.com`. Se senha/MFA forem exigidos e não puderem ser concluídos com a sessão já disponível, deixar a página visível para preenchimento direto pelo usuário; depois validar e editar a célula sintética esperada.

## Estado Microsoft

- GitHub OIDC → Entra e `Sites.Selected` já comprovados em modo read-only.
- Site `CENTROADMIN` e library `ARQUIVOS_PLATAFORMA` confirmados.
- Pasta confirmada: `ARQUIVOS_PLATAFORMA/BANCO_NOTAS_HOMOLOGACAO`.
- Upload/download/delete Graph real executado no run `33024306664` somente no boundary dedicado.
- `GUI@escolaieda.com` resolvido no perfil Entra: membro e conta habilitada; OID real conferido sem invenção.
- Compartilhamento individual ativo somente para `GUI@escolaieda.com`; arquivo sintético retido temporariamente para Excel.
- O arquivo abriu no Excel Online ainda sob a sessão administrativa; conteúdo visual correto, em modo de leitura nessa sessão.
- Tela Microsoft `Entrar` aberta para troca à conta destinatária; coleta segura automatizada indisponível, aguardando preenchimento manual na interface.
- Nenhuma credencial, token, cookie ou MFA registrado.

## Estado Cloudflare

- D1 exclusivo `banco-notas-homologation` validado até migration `0007`.
- Run `33026452850` success; vínculo do professor/modelo sintéticos ao OID autorizado e sync final desligado.
- Nenhum D1 ou Pages de produção alterado nesta retomada.

## Recursos temporários existentes

- Stash local recuperável: `stash@{0}` — `safety-before-recover-pr52-2026-08-26`.
- Pasta M365 `BANCO_NOTAS_HOMOLOGACAO`: confirmada e retida conforme autorizado.
- Registro sintético D1 de homologação para o teste de share; ambiente homologation e sync `0`.
- XLSX `banco-notas-share-excel-sintetico-20260826.xlsx` e sua permissão individual estão temporariamente ativos até o round-trip/cleanup.

## Recursos já limpos

- XLSX sintético do run `33024306664` removido do SharePoint com sucesso.
- XLSX sintético do run `33025586408` removido do SharePoint com sucesso.
- Permissão e XLSX da primeira tentativa de share (`33026678794`) foram compensados e removidos.

## Commits

- HEAD recuperado: `848b78fe413345a115151f5a545c338bcc73c66c` — `test: isolar homologacao M365 em Node real`.
- `origin/main`: `d0f03dccfe879024eb1a4cb8d8e3ee0a55adea77`.
- `ec483b7` — correção do cleanup fora de `finally` e checkpoint inicial.
- `5ee994e` — merge do `origin/main` atual no branch.
- O branch agora contém integralmente `origin/main`; produção continua intocada.
- `8144de5` — preparação fail-closed do vínculo sintético autorizado no D1 de homologação.
- `1435bee` — share individual one-shot e gates de permissão/integridade.
- `14d9eb1` — distinção fail-closed entre baseline efetivo e novas concessões.
- `18f35be` — remoção do job one-shot após sucesso.

## Runs

- `33008170523` — CI and deploy — failure no lint; storage M365 e produção skipped.
- `33024306664` — validação/segurança success; storage M365 failure por diferença de tamanho/hash; arquivo removido; produção skipped.
- `33024796115` — validação/segurança success; diagnóstico M365 confirmou reanálise OOXML e cleanup; artefato XLSX temporário depois excluído.
- `33025586408` — success completo; storage Graph real, integridade normalizada, reanálise e cleanup verdes; produção skipped.
- `33026452850` — D1 homologation success; vínculo autorizado preparado e sync `0`.
- `33026678794` — primeira tentativa de share falhou fechado; permissão e arquivo compensados.
- `33026888705` — share individual success; XLSX retido para Excel e produção skipped.
- `33027020137` — CI success após retirada do job one-shot; nenhuma repetição do share.
- `32981705701` — Banco de Notas D1 homologation — success.
- `33003875460` — M365 operations/readiness — success.
- `33006204505` — CI and deploy — último baseline anterior verde após incorporar o Control Plane M365 então vigente.

## Bloqueios

- A troca para a conta destinatária exige preenchimento manual na página Microsoft já aberta; o navegador não disponibilizou a coleta segura automatizada.
- Edição, round-trip pós-edição, revogação e cleanup aguardam esse login.

## Como retomar

1. Após o usuário responder `pronto`, inspecionar a página Microsoft/Excel sem observar credenciais.
2. Confirmar sessão `GUI@escolaieda.com`, modo de edição e os dados sintéticos visíveis.
3. Alterar somente a nota sintética esperada e aguardar o salvamento do Excel.
4. Executar download/reanálise backend, registrar a mudança e então revogar a permissão e remover o XLSX.
