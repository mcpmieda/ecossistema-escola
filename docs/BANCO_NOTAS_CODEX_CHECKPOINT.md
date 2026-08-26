# Banco de Notas — Codex Checkpoint

Última atualização: 26/08/2026 11:34 BRT
Branch: `feat/banco-de-notas-foundation`
HEAD: `c41e04f42c6db866d4df41d94bb9790c9b6f0668`
PR: `#52` — open, draft, sem merge
CI mais recente: `32978280552` — failure em lint no HEAD `c41e04f`
D1 homologation run mais recente: `32977813303` — success no HEAD `5f52839`

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

## Em andamento

- [ ] Commitar e publicar a correção da CI para obter evidência verde no GitHub Actions.
- [ ] Executar novamente a homologação D1 e confirmar migration `0007` e seu smoke remoto.

## Próxima ação exata

Revisar o diff, formatar o checkpoint, criar commit da correção da CI e fazer push para a branch do PR; depois acompanhar CI normal e homologação D1.

## Estado dos ambientes

### GitHub

- Repositório: `mcpmieda/ecossistema-escola`.
- Branch: `feat/banco-de-notas-foundation`.
- PR #52: open, draft, base `main`.
- HEAD remoto inicial desta sessão: `c41e04f42c6db866d4df41d94bb9790c9b6f0668`.
- Última CI: run `32978280552`, failure exclusivamente observada em lint; deploy/recovery de produção skipped.

### Cloudflare

- D1 conhecido: `banco-notas-homologation`.
- Workflow mais recente de homologação: run `32977813303`, success, porém a evidência detalhada da migration `0007` ainda precisa ser consolidada nesta sessão.
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

- Nenhum commit criado até este checkpoint.

## CIs / workflows

- `32978280552` — failure — lint `no-control-regex` no HEAD inicial.
- `32977813303` — success — D1 homologation no commit `5f52839`.
- Gate local pós-correção — success — formatting, lint, typecheck, semantic contract, 283/283 testes e build.

## Problemas encontrados

- Regex de caracteres de controle violava `no-control-regex`.
- Vitest atual não aceita argumento genérico em `toMatchObject` naquele matcher.
- Igualdade direta entre typed arrays visualmente idênticos falhava por identidade/protótipo de realm; a asserção agora compara os mesmos bytes como arrays numéricos.

## Decisões técnicas tomadas

- Validar nomes de arquivo por iteração explícita de caracteres, preservando fail-closed para barras e ASCII `0x00`–`0x1f`.
- Manter o teste de upload estritamente byte a byte, removendo apenas a dependência de realm da representação `Uint8Array`.

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
3. Commitar e publicar a correção da CI na branch do PR #52.
4. Aguardar CI normal verde.
5. Disparar/acompanhar `Banco de Notas D1 homologation` e consolidar a prova remota da migration `0007`.
6. Para retomar Microsoft externo, autenticar uma sessão administrativa apropriada ou disponibilizar um fluxo de homologação com credencial de menor privilégio; não reutilizar produção por conveniência.
