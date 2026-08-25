# Release — Centro de Administração v1

Data: `2026-08-25`

Status: **produção oficial**

## Identificação

- PR de release: `#48 — Release — Centro de Administração v1 para produção`
- commit em `main`: `c605089d024d584a85ef81dab986a31bee5e4a22`
- versão do núcleo: `1.0.0`
- `releaseState`: `production`
- domínio institucional: `https://admin.escolaieda.com`
- revisão Cloudflare Pages: `https://6dc1c75e.ecossistema-escola.pages.dev`

## Autorização humana

A liberação foi autorizada pelo comando exato previsto no protocolo:

`APROVADO PARA PRODUÇÃO`

A autorização ocorreu somente depois da validação humana da candidata previamente publicada.

## Escopo da promoção

A release promoveu para `ready`:

- Visão geral;
- Operação;
- Sistemas;
- Auditoria;
- Configurações.

Permanecem planejadas:

- Publicações;
- Páginas.

A release não integrou um sistema independente e não criou novas regras de negócio.

## Acabamento de produção

Foram removidos da experiência comum os principais resíduos de ambiente de desenvolvimento/validação:

- banners e alertas permanentes de validação;
- linguagem de candidata;
- linguagem técnica desnecessária sobre capabilities, BFF, read model e HealthEndpoint;
- IDs internos e versão de contrato da tabela de Sistemas;
- versão técnica e correlation ID do rodapé comum;
- CSS temporário associado ao banner removido.

Os correlation IDs permanecem onde têm função real de suporte, erro e auditoria.

## CI do PR

Workflow:

`32885247605` — **success**

Jobs obrigatórios:

- `Validate application` — **success**;
- `Validate GitHub Actions security` — **success**.

`Deploy production` e `Verify recovery after deploy` ficaram `skipped` no evento de PR, conforme o desenho do pipeline.

## CI pós-merge e deploy

Workflow:

`32885417365` — run `#404` — **success**

Jobs:

- `Validate GitHub Actions security` — job `97924594797` — **success**;
- `Validate application` — job `97924595070` — **success**;
- `Deploy production` — job `97924849730` — **success**;
- `Verify recovery after deploy` — job `97925036928` — **success**.

O deploy Cloudflare foi feito a partir do SHA exato da release e o Wrangler registrou `Deployment complete`.

## Recovery

Artefato:

- nome: `recovery-verification-32885417365`;
- ID: `9577448564`;
- digest: `sha256:8a4d5bb690da10021aff5880456dc7155f6e41a53bfde7ee5a5e1abd7c94cd5c`;
- expiração prevista: `2026-11-23`.

A verificação executou rebuild da fonte publicada, round trip descartável de backup/restore SharePoint, cleanup e publicação de evidência redigida.

## Segurança preservada

A promoção não alterou:

- Microsoft Entra ID;
- BFF/cookie HttpOnly;
- política de capabilities server-side;
- grupos ou roles institucionais;
- permissões Microsoft Graph;
- tenant/app registration/redirect URI;
- SharePoint `CENTROADMIN`;
- Cloudflare Pages;
- rotação automática da identidade técnica.

Usuários sem a capability administrativa necessária continuam bloqueados em modo fail closed.

## Governança

A branch `main` permanece protegida.

Checks obrigatórios:

- `Validate application`;
- `Validate GitHub Actions security`.

A integração da release ocorreu somente após os checks obrigatórios passarem.

## Limites conhecidos

O warning de chunk JavaScript acima de `500 kB` permanece como oportunidade de otimização futura e não como falha da release.

O self-test de recovery não equivale a declaração de disaster recovery completo de todos os dados operacionais.

## Próximo avanço

Com a fundação v1 oficialmente liberada, o próximo marco recomendado é integrar o primeiro sistema independente ao Centro e validar o contrato modular de ponta a ponta.
