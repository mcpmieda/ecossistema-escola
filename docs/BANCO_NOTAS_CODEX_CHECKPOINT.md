# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026 11:40 BRT
Branch: `feat/banco-de-notas-foundation`
HEAD: `a516fae567cf6ff7ab8a15a70471d1455693e5db`
PR: `#52` — open, draft, sem merge
CI mais recente: `32981035469` — success no HEAD `2bb0750`
D1 homologation run mais recente: `32981239012` — success no HEAD `a516fae`

## Objetivo do bloco atual

Fechar a CI corrente, validar a migration `0007` no D1 remoto de homologação e avançar com segurança na integração backend-only Graph/SharePoint e na preparação Entra/add-in, sem tocar produção e mantendo sync desligado.

## Concluído nesta sessão

- [x] Checkout local confirmado no repositório `mcpmieda/ecossistema-escola`.
- [x] Branch atualizada por fast-forward até o HEAD remoto real `c41e04f`.
- [x] PR #52 confirmado aberto e draft; corpo, checks, comentários e ausência de reviews/review comments auditados.
- [x] Falha mais recente da CI confirmada como `no-control-regex` em `teacher-model-graph-gateway.ts`.
- [x] Validação de nome Graph corrigida sem `eslint-disable` e sem enfraquecer o bloqueio de barras/caracteres ASCII de controle.
- [x] Incompatibilidade de tipo do matcher Vitest corrigida.
- [x] Comparação do corpo XLSX estabilizada como igualdade byte a byte independente de realm.
- [x] Gate local completo aprovado: formatting, lint, typecheck, semantic contract, 52 arquivos/283 testes, build.
- [x] Documentação técnica obrigatória e workflow D1 corrente revisados.
- [x] Ferramentas e autenticação locais auditadas sem revelar secrets.
- [x] Wrangler `4.125.0` confirmado via dependência do projeto, sem autenticação local.
- [x] Sessão do portal Microsoft verificada e confirmada como não autenticada.
- [x] Correção da CI commitada e publicada no commit `2bb0750`.
- [x] CI normal verde no run `32981035469`; deploy e recovery de produção skipped.
- [x] Workflow D1 `32981239012` executado com sucesso e database `banco-notas-homologation` reutilizado.
- [x] Run `32981239012` confirmou migrations `0001`–`0007`, sync bloqueado sem OID, unicidade do OID e smokes existentes.
- [x] Lacuna de evidência identificada: o smoke remoto não exercitava troca de OID/inativação durante sync.
- [x] Smoke ampliado localmente para testar ambos os locks com sync temporário e provar estado final `sync_enabled=0`.
- [x] Regressão do smoke atualizada; parser PowerShell e gate local completo aprovados.

## Em andamento

- [ ] Publicar o smoke ampliado e executar novamente a homologação D1 para fechar todos os invariantes remotos da migration `0007`.

## Próxima ação exata

Commitar e publicar o smoke ampliado; acompanhar CI normal e o workflow D1 acionado pelo push até provar remotamente os locks de identidade/status e o estado final `sync_enabled=0`.

## Estado dos ambientes

### GitHub

- Repositório: `mcpmieda/ecossistema-escola`.
- Branch: `feat/banco-de-notas-foundation`.
- PR #52: open, draft, base `main`.
- HEAD remoto inicial desta sessão: `c41e04f42c6db866d4df41d94bb9790c9b6f0668`.
- CI anterior: run `32978280552`, failure em lint no HEAD `c41e04f`.
- CI corrente: run `32981035469`, success no HEAD `2bb0750`; deploy/recovery de produção skipped.

### Cloudflare

- D1 conhecido: `banco-notas-homologation`.
- Workflow `32981239012`: success no HEAD `a516fae`; reutilizou o banco existente, sem migrations pendentes, e executou os smokes com dados sintéticos.
- Wrangler local: `4.125.0`, não autenticado.
- Variáveis `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_D1_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`: ausentes do processo local.
- Secrets GitHub existentes por nome: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_D1_API_TOKEN`.
- Nenhuma alteração de recurso Cloudflare executada nesta sessão até este checkpoint.

### Microsoft / Entra

- Azure CLI, Microsoft 365 CLI e Graph CLI: indisponíveis localmente.
- Portal Entra: redireciona para login; não existe sessão administrativa autenticada disponível no navegador selecionado.
- IDs públicos conhecidos permanecem disponíveis apenas nas GitHub variables existentes; nenhum segredo Microsoft está disponível no terminal.
- Nenhum app registration, scope, audience, permissão ou tenant foi alterado nesta sessão.

### Graph / SharePoint

- Adapter backend-only existente revisado no contexto da falha de CI.
- Nenhuma chamada Graph real nem alteração SharePoint executada nesta sessão.

## Recursos criados ou alterados

| Recurso                   | Ambiente   | ID/nome seguro                                          | Estado                              |
| ------------------------- | ---------- | ------------------------------------------------------- | ----------------------------------- |
| Arquivo de checkpoint     | Git/branch | `docs/BANCO_NOTAS_CODEX_CHECKPOINT.md`                  | criado                              |
| Gateway Graph             | Git/branch | `server/banco-notas/teacher-model-graph-gateway.ts`     | correção local, gate verde          |
| Teste de ownership add-in | Git/branch | `tests/banco-notas-addin-authorizer.test.ts`            | correção local, gate verde          |
| Teste do gateway Graph    | Git/branch | `tests/banco-notas-teacher-model-graph-gateway.test.ts` | comparação byte a byte estabilizada |

Nunca registrar secrets.

## Commits desta sessão

- `2bb0750` — fechar baseline da CI do Banco de Notas e criar checkpoint persistente.
- `a516fae` — registrar CI verde antes da operação D1.

## CIs / workflows

- `32978280552` — failure — lint `no-control-regex` no HEAD inicial.
- `32977813303` — success — D1 homologation no commit `5f52839`.
- `32981035469` — success — CI normal completa no commit `2bb0750`; jobs de produção skipped.
- `32981239012` — success — D1 remoto reutilizado; migrations `0001`–`0007` e smokes correntes aprovados.
- Gate local pós-correção — success — formatting, lint, typecheck, semantic contract, 283/283 testes e build.

## Problemas encontrados

- Regex de caracteres de controle violava `no-control-regex`.
- Vitest atual não aceita argumento genérico em `toMatchObject` naquele matcher.
- Igualdade direta entre typed arrays visualmente idênticos falhava por identidade/protótipo de realm; a asserção agora compara os mesmos bytes como arrays numéricos.
- O smoke D1 remoto inicial da migration `0007` não cobria os triggers de lock de OID e status durante sync; a cobertura foi ampliada antes de declarar o bloco completo.

## Decisões técnicas tomadas

- Validar nomes de arquivo por iteração explícita de caracteres, preservando fail-closed para barras e ASCII `0x00`–`0x1f`.
- Manter o teste de upload estritamente byte a byte, removendo apenas a dependência de realm da representação `Uint8Array`.
- Permitir sync somente de forma temporária no smoke sintético para exercitar os locks e desligá-lo explicitamente antes do fim, com asserção remota de `sync_enabled=0`.

## Bloqueios externos

- Microsoft/Entra/Graph/SharePoint real: bloqueado por ausência de CLI/credencial/sessão autenticada neste ambiente.
- Cloudflare local: sem token/login; a homologação D1 ainda pode avançar pelo workflow GitHub Actions já autorizado e dedicado.

## Não fazer ao retomar

- não fazer merge;
- não tirar o PR de draft;
- não tocar produção, D1 de produção ou Pages de produção;
- não habilitar sync sem gate completo;
- não usar compartilhamento anônimo;
- não registrar ou persistir tokens/secrets;
- não usar golden masters privados como produto ou fixture;
- não ampliar permissões sem necessidade comprovada.

## Como retomar

1. Confirmar `git status --short --branch` e o HEAD registrado acima.
2. Revisar o diff local e repetir `npm run verify` se qualquer arquivo de código tiver mudado.
3. Commitar/push do smoke ampliado e acompanhar CI + D1 homologation.
4. Consolidar a prova remota da migration `0007` nos documentos obrigatórios e no corpo do PR.
5. Para retomar Microsoft externo, autenticar uma sessão administrativa apropriada ou disponibilizar um fluxo de homologação com credencial de menor privilégio; não reutilizar produção por conveniência.
