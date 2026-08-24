# Segurança da fundação

## Controles implantados

- Entra single-tenant; contas pessoais e outros tenants são rejeitados.
- Authorization Code + PKCE, `state` e `nonce` imprevisíveis e validados.
- Sessão máxima de 8 horas, selada com AES-GCM e cookie `HttpOnly; Secure; SameSite=Lax`.
- Papéis derivados exclusivamente dos cinco grupos Microsoft 365 existentes.
- BFF mantém tokens Graph e chaves privadas fora do JavaScript do navegador.
- Graph Backend possui somente `Sites.Selected`; a concessão explícita é `write` no `CENTROADMIN`; outro site retorna 403.
- Apps Web e Graph usam certificados em dois slots sobrepostos; não há client secret de runtime.
- GitHub autentica-se no Entra por OIDC com issuer, audience e subject imutável exatos.
- App de manutenção tem apenas `Application.ReadWrite.OwnedBy` e é owner somente dos dois apps que rotaciona.
- Segredos Cloudflare: `GRAPH_CREDENTIAL_A/B`, `WEB_CREDENTIAL_A/B` e `SESSION_SECRET`; valores nunca entram no GitHub ou nos relatórios.
- CSP sem `unsafe-eval`, HSTS, `nosniff`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, política de permissões e `Referrer-Policy: same-origin`. Essa política não envia a URL interna a sites externos e mantém o cabeçalho `Origin` utilizável no formulário POST de logout.
- Escritas exigem Origin oficial; JSON é limitado; métodos não permitidos retornam 405.
- Logs contêm apenas erro técnico, caminho e correlation ID; não registram Authorization, cookies, tokens ou payload Graph.
- SharePoint externo e links anônimos estão desabilitados.

## Modelo de ameaça resumido

| Risco                        | Controle                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| Roubo de token no frontend   | Nenhum token privilegiado é entregue ao frontend                       |
| Login de tenant externo      | validação exata de issuer/tenant/audience                              |
| Replay/troca de callback     | PKCE, state, nonce e cookie temporário selado                          |
| Elevação por grupo inventado | allowlist por Object ID e 403 sem grupo conhecido                      |
| CSRF em escrita              | Origin exata, SameSite, método POST e regressão para Origin nula       |
| Vazamento de credencial      | Cloudflare Secrets, GitHub Secrets e varredura do repo                 |
| Falha durante rotação        | dois slots funcionais, validação antes da remoção e cleanup comprovado |
| Acesso Graph lateral         | Sites.Selected + grant apenas CENTROADMIN; prova 403 externa           |
| Abuso de automação futura    | contrato Zod e allowlist; sem código arbitrário                        |

## IDENTIDADE TÉCNICA E MANUTENÇÃO ZERO-LEMBRANÇA

Foi investigado se Pages/Workers poderia emitir, em runtime, um workload token OIDC próprio aceito diretamente pelo Entra. A documentação oficial não fornece issuer/subject/audience, discovery e JWKS para uma identidade de workload outbound do Worker. Cloudflare Access identifica quem chama o Worker, não o Worker ao chamar o Entra. Portanto: **SECRETLESS CLOUDFLARE RUNTIME → ENTRA: NÃO SUPORTADO / NÃO COMPROVADO**.

A solução implantada elimina a lembrança humana sem inventar um emissor: GitHub Actions obtém um token OIDC efêmero; o Entra confia no subject imutável do repositório e ambiente `production`; o workflow cria um certificado de 180 dias, grava a chave privada diretamente em um slot secreto do Pages, publica, valida o token e o acesso real e só então remove a credencial mais antiga. Ele roda semanalmente e só rotaciona a 60 dias ou menos. Uma falha remove o candidato e preserva os dois slots funcionais.

O token Cloudflare usado pelo CI é account-owned, com apenas Pages Write, escopo da conta e sem data de expiração. Essa escolha evita um rotator circular que exigiria a permissão muito mais ampla `Account API Tokens Edit`. Ele deve ser revogado imediatamente em caso de suspeita de exposição. `SESSION_SECRET` também não tem expiração de provedor; deve ser girado somente em incidente, pois a troca encerra todas as sessões vigentes.

## O que “Inspecionar página” mostra

É normal ver HTML, CSS, JavaScript, Client ID público, Tenant ID, nomes de endpoints e status técnico. Não é possível obter por essa via as chaves privadas, certificados completos com chave, `SESSION_SECRET`, tokens Graph, cookie HttpOnly ou conteúdo SharePoint protegido.

## GitHub Actions Supply Chain Hardening

Todas as Actions externas são referenciadas por SHA completo e imutável; o comentário ao lado preserva a release humana. `checkout` não persiste credenciais Git. O job normal de CI possui somente `contents: read`; apenas o job de rotação possui `id-token: write`, documentado e necessário para GitHub OIDC → Entra. O deploy e a rotação usam `environment: production`; nenhum job de PR usa esse environment ou referencia secrets de produção. A rotação também exige explicitamente `refs/heads/main`, impedindo que uma ref escolhida em `workflow_dispatch` receba as credenciais de produção.

O próprio repositório exige SHA pinning (`sha_pinning_required: true`) e permite somente Actions mantidas pelo GitHub mais `zizmorcore/zizmor-action`; outras Actions externas são bloqueadas por configuração, mesmo antes da revisão humana.

O gate `workflow-security`, sem secrets de produção, executa actionlint 1.7.12 e zizmor 1.29.0 antes do deploy. O arquivo do actionlint vem da release oficial e é aceito somente após SHA-256 exato. Dependabot monitora `github-actions` semanalmente, com cooldown de sete dias e sem automerge.

Os dois valores Cloudflare estão realmente em GitHub repository Actions Secrets, não em environment secrets. No estado atual, somente a conta administradora `mcpmieda` possui acesso ao repositório; PRs externos, Dependabot e o job `validate` não recebem esses valores. O plano GitHub atual não disponibiliza branch protection/deployment branch policies para este repositório privado. Migrar os secrets para outro escopo exigiria conhecer ou substituir seus valores, o que este hardening deliberadamente não fez.

Guardrails para futuros agentes: não substituir SHA por `@vX`; não adicionar `id-token: write` ao CI normal; não referenciar production secrets em PR; não remover `environment: production`; não remover a guarda `github.ref == 'refs/heads/main'` da rotação; não mudar o subject OIDC sem revisar a FIC do Entra; não habilitar automerge cego; não adicionar aprovação humana periódica à rotação autônoma.
