# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026 21:23 BRT
Branch: `feat/banco-de-notas-foundation`
HEAD: `8144de55ebc3a7848eeb2551d38258fbc057166c`
PR: `#52` — open, draft, sem merge
CI: run `33025586408` — success completo, incluindo storage M365
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

## Em andamento

- [ ] Executar o share individual autenticado e reter o único XLSX sintético apenas para a validação no Excel Online.

## Próxima ação exata

Publicar o job one-shot de share, exigir correspondência exata do OID, ausência de `Anyone`/organização/grupo/outro usuário e baixar a evidência redigida com a URL do Excel.

## Estado Microsoft

- GitHub OIDC → Entra e `Sites.Selected` já comprovados em modo read-only.
- Site `CENTROADMIN` e library `ARQUIVOS_PLATAFORMA` confirmados.
- Pasta confirmada: `ARQUIVOS_PLATAFORMA/BANCO_NOTAS_HOMOLOGACAO`.
- Upload/download/delete Graph real executado no run `33024306664` somente no boundary dedicado.
- `GUI@escolaieda.com` resolvido no perfil Entra: membro e conta habilitada; OID real conferido sem invenção.
- Nenhum compartilhamento realizado até este checkpoint.
- Nenhuma credencial, token, cookie ou MFA registrado.

## Estado Cloudflare

- D1 exclusivo `banco-notas-homologation` validado até migration `0007`.
- Run `33026452850` success; vínculo do professor/modelo sintéticos ao OID autorizado e sync final desligado.
- Nenhum D1 ou Pages de produção alterado nesta retomada.

## Recursos temporários existentes

- Stash local recuperável: `stash@{0}` — `safety-before-recover-pr52-2026-08-26`.
- Pasta M365 `BANCO_NOTAS_HOMOLOGACAO`: confirmada e retida conforme autorizado.
- Registro sintético D1 de homologação para o teste de share; ambiente homologation e sync `0`.

## Recursos já limpos

- XLSX sintético do run `33024306664` removido do SharePoint com sucesso.
- XLSX sintético do run `33025586408` removido do SharePoint com sucesso.
- Nenhuma permissão Graph criada nesta retomada.

## Commits

- HEAD recuperado: `848b78fe413345a115151f5a545c338bcc73c66c` — `test: isolar homologacao M365 em Node real`.
- `origin/main`: `d0f03dccfe879024eb1a4cb8d8e3ee0a55adea77`.
- `ec483b7` — correção do cleanup fora de `finally` e checkpoint inicial.
- `5ee994e` — merge do `origin/main` atual no branch.
- O branch agora contém integralmente `origin/main`; produção continua intocada.
- `8144de5` — preparação fail-closed do vínculo sintético autorizado no D1 de homologação.

## Runs

- `33008170523` — CI and deploy — failure no lint; storage M365 e produção skipped.
- `33024306664` — validação/segurança success; storage M365 failure por diferença de tamanho/hash; arquivo removido; produção skipped.
- `33024796115` — validação/segurança success; diagnóstico M365 confirmou reanálise OOXML e cleanup; artefato XLSX temporário depois excluído.
- `33025586408` — success completo; storage Graph real, integridade normalizada, reanálise e cleanup verdes; produção skipped.
- `33026452850` — D1 homologation success; vínculo autorizado preparado e sync `0`.
- `32981705701` — Banco de Notas D1 homologation — success.
- `33003875460` — M365 operations/readiness — success.
- `33006204505` — CI and deploy — último baseline anterior verde após incorporar o Control Plane M365 então vigente.

## Bloqueios

- Compartilhamento e validação visual ainda não executados; o job one-shot está pronto localmente e ainda não foi publicado neste checkpoint.
- Credencial/MFA no navegador interno somente se a Microsoft solicitar durante a validação visual posterior.

## Como retomar

1. Commitar e publicar somente o job one-shot de share M365 já validado localmente.
2. Acompanhar o run até a correspondência exata de identidade, permissão mínima e integridade OOXML.
3. Remover o job do workflow sem repetir o share e usar a URL privada da evidência para abrir no navegador interno.
4. Pausar apenas se a Microsoft pedir credencial/MFA da conta destinatária.
