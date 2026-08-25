# VERIFICATION — Centro de Administração v1

## Estado da verificação

O Centro de Administração v1 está oficialmente liberado em produção.

`releaseState = production`

Versão do núcleo:

`1.0.0`

Domínio oficial:

`https://admin.escolaieda.com`

A autorização humana formal ocorreu pelo comando exato:

`APROVADO PARA PRODUÇÃO`

## Release oficial

PR:

`#48 — Release — Centro de Administração v1 para produção`

Commit integrado em `main`:

`c605089d024d584a85ef81dab986a31bee5e4a22`

Workflow pós-merge:

`32885417365` — run `#404` — **success**.

Revisão Cloudflare Pages criada pelo deploy:

`https://6dc1c75e.ecossistema-escola.pages.dev`

## Escopo verificado

A release oficial promoveu para `ready`:

- Visão geral;
- Operação;
- Sistemas;
- Auditoria;
- Configurações.

Continuam `planned`:

- Publicações;
- Páginas.

A promoção não introduziu operações de escrita nessas áreas futuras e não integrou artificialmente nenhum sistema independente.

## Fundação preservada

A release não reconstruiu nem substituiu:

- Microsoft Entra ID;
- BFF e cookie HttpOnly selado;
- capabilities e grants server-side;
- grupos/roles institucionais;
- Microsoft Graph;
- SharePoint;
- Cloudflare Pages;
- pipeline CI/CD;
- recovery técnico;
- rotação automática;
- contratos de dados e regras de negócio existentes.

Não houve alteração de tenant, app registration, redirect URI, grupos, roles ou permissões Microsoft nesta liberação.

## Verificação do PR #48

Workflow do PR:

`32885247605` — **success**.

### Validate application

Concluído com sucesso:

- instalação locked de dependências;
- verificação de formatação;
- lint;
- typecheck;
- validação do contrato semântico existente;
- testes;
- build.

### Validate GitHub Actions security

Concluído com sucesso:

- actionlint;
- zizmor.

### Deploy/recovery no PR

`Deploy production` e `Verify recovery after deploy` permaneceram `skipped`, como projetado para eventos de pull request.

Isso evita exigir jobs de pós-merge como gate pré-merge.

## Verificação pós-merge em main

Workflow:

`32885417365` — **success**.

Todos os quatro jobs concluíram com sucesso.

### Validate GitHub Actions security

Job ID:

`97924594797`

Resultado:

**success**.

### Validate application

Job ID:

`97924595070`

Resultado:

**success**.

O pipeline confirmou novamente formatting, lint, typecheck, contrato semântico, testes e build no commit exato de produção.

### Deploy production

Job ID:

`97924849730`

Resultado:

**success**.

O Cloudflare Pages recebeu o commit:

`c605089d024d584a85ef81dab986a31bee5e4a22`

O log do Wrangler registrou:

`Deployment complete`

URL da revisão publicada:

`https://6dc1c75e.ecossistema-escola.pages.dev`

O mapeamento institucional existente para `https://admin.escolaieda.com` não foi alterado pela release.

### Verify recovery after deploy

Job ID:

`97925036928`

Resultado:

**success**.

Etapas confirmadas:

- rebuild da mesma fonte publicada;
- round trip descartável de backup/restore SharePoint;
- publicação de evidência redigida;
- cleanup do recurso temporário.

Artefato de evidência:

- nome: `recovery-verification-32885417365`;
- ID: `9577448564`;
- tamanho: `429 bytes`;
- digest: `sha256:8a4d5bb690da10021aff5880456dc7155f6e41a53bfde7ee5a5e1abd7c94cd5c`;
- expiração prevista: `2026-11-23`.

O self-test comprova o mecanismo técnico previsto de recovery em recurso descartável. Ele não deve ser descrito como disaster recovery completo de todos os dados operacionais.

## Verificação de autenticação e autorização

A cobertura existente continua confirmando que:

- cada `/auth/login` cria transação nova;
- `state`, `nonce`, PKCE verifier e expiração são preservados server-side;
- múltiplas tentativas independentes podem coexistir;
- transações expiradas são descartadas;
- callbacks inválidos não estabelecem sessão;
- falhas browser-facing não expõem JSON cru, authorization code, token, state, nonce, verifier, cookie ou segredo;
- token exchange permanece exclusivamente server-side e por `POST`;
- logout limpa sessão e estado temporário;
- rotas protegidas continuam `no-store/no-cache`;
- usuários sem `platform.snapshot.read` recebem negação server-side;
- a promoção para produção não ampliou capabilities para professores ou outros perfis não administrativos.

## Verificação de acabamento de produção

O PR #48 removeu da experiência comum:

- banner `Ambiente de validação`;
- aviso `Centro em validação controlada`;
- chip `Validação restrita`;
- texto `ativo em validação`;
- linguagem de `capabilities administrativas` na tela de acesso negado;
- exposição direta de `HealthEndpoint`, `BFF` e `read model` na área de Operação;
- IDs internos de módulo e versão de contrato na tabela de Sistemas;
- correlation ID e versão técnica no rodapé comum;
- CSS morto do banner de validação.

Permanece preservado o correlation ID em contextos onde ele tem função operacional real, como erro, auditoria e suporte.

Foi adicionado o teste:

`tests/production-release.test.ts`

Esse teste protege:

- `releaseState = production`;
- versão `1.0.0`;
- áreas liberadas em `ready`;
- Publicações/Páginas em `planned`;
- ausência de linguagem de validação/desenvolvimento definida como proibida na interface de produção.

## Verificação de UI e interação preservada

As garantias do hardening final continuam válidas:

- perfil HeroUI com `Avatar`, `Dropdown` e logout;
- busca inline desktop/mobile;
- `Ctrl/Cmd + K` para foco da busca;
- `Escape` para fechamento;
- navegação e fechamento do resultado na mesma interação;
- breadcrumbs e tabelas responsivas;
- `Table.ScrollContainer` nas tabelas estruturadas;
- Ambient Constellation apenas como background geral;
- reduced-motion respeitado.

## Governança da main

A branch `main` permanece protegida.

Checks obrigatórios:

- `Validate application`;
- `Validate GitHub Actions security`.

O PR #48 foi integrado somente depois desses gates passarem.

## Baseline histórica

### PR #45

Hardening funcional final antes da promoção:

- commit: `f59cf4bcf6815ef57edc9eb4558e09a08f93aedd`;
- workflow: `32877197391` — **success**.

### PR #46

Sincronização documental pré-release:

- commit: `6660ce1960c7dbeb8cef7a1f073a9c3d8e832e6b`.

### Specs da fase de hardening

Os arquivos `specs/semantic-contract.json`, `specs/semantic-assurance.json` e `specs/verification-plan.json` continuam preservados como contrato/evidência da fase de hardening que antecedeu a autorização de produção.

A condição viva de release passou a ser registrada por:

- `PROJECT_STATE.md`;
- este `VERIFICATION.md`;
- contrato de runtime;
- `tests/production-release.test.ts`;
- evidência do workflow pós-merge.

## Performance e otimização futura

O build ainda emite warning de chunk JavaScript acima de `500 kB` minificado.

Na release v1 ele não é bloqueador porque:

- `Validate application` passou;
- testes passaram;
- build passou;
- deploy passou;
- recovery passou.

A futura decisão de code splitting deve usar métricas de carregamento inicial e não apenas o limite estático do bundler.

## Resultado final

**RELEASE APROVADA E IMPLANTADA.**

- estado: `production`;
- versão: `1.0.0`;
- PR: `#48`;
- commit: `c605089d024d584a85ef81dab986a31bee5e4a22`;
- workflow: `32885417365` — **success**;
- recovery: **verified**;
- autorização administrativa: preservada e fail closed;
- Publicações/Páginas: não liberadas.

Qualquer mudança futura material em regra, fluxo, dados, autorização, segurança ou comportamento observável deve entrar por novo PR e receber regressão proporcional.

## Referências

- estado atual: `PROJECT_STATE.md`;
- evidência de release: `docs/RELEASE_CENTRO_ADMIN_V1_2026-08-25.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- hardening Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`.
