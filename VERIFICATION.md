# VERIFICATION — Centro de Administração v1

## Estado da verificação

O Centro de Administração v1 está oficialmente liberado e atualizado em produção.

`releaseState = production`

Versão do núcleo:

`1.0.0`

Domínio oficial:

`https://admin.escolaieda.com`

A autorização humana formal da release ocorreu pelo comando exato:

`APROVADO PARA PRODUÇÃO`

## Estado corrente

Release original:

- PR: `#48 — Release — Centro de Administração v1 para produção`;
- commit: `c605089d024d584a85ef81dab986a31bee5e4a22`;
- workflow pós-merge: `32885417365` — run `#404` — **success**.

Atualização visual corrente:

- PR: `#50 — Visual — limpar Ambient e padronizar shell HeroUI`;
- commit corrente em `main`: `9ae6c49bbfe5f57577537ff480dfc833bddaad8a`;
- workflow pós-merge: `32892663858` — run `#417` — **success**.

## Banco de Notas — decisão de verificação dos modelos

No branch `feat/banco-de-notas-foundation`, foi registrada a separação obrigatória entre produto e homologação privada:

- o produto usará um modelo genérico limpo;
- golden masters Nina/Alanna permanecem externos e privados;
- esses arquivos não podem entrar em runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição;
- regressão privada nesses dois casos é evidência complementar, não permissão para especializar o produto;
- generalização exige fixtures sintéticas variadas e ausência de dependências por professor/abas/turmas/disciplinas.

Esta seção registra o gate decidido; não declara que o transformador ou o modelo genérico já foram implementados ou homologados. A fonte detalhada é `docs/BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md`.

Evidência funcional consolidada do PR #52 antes da atualização documental corrente:

- head: `94ccceff31d6355b8ce6eaa396eba16e2ecd1932`;
- workflow: `32911996770` — run `#495` — **success**;
- `Validate application` — success;
- `Validate GitHub Actions security` — success;
- formatação — success;
- lint — success;
- typecheck — success;
- semantic check — success;
- testes — **167/167 aprovados em 28 arquivos**;
- build — success;
- suíte `tests/banco-notas-d1-grade-event-store.test.ts` — **4/4** cenários aprovados com SQLite real;
- deploy de produção — skipped;
- recovery pós-deploy — skipped.

O build continua emitindo o warning histórico de chunk JavaScript acima de 500 kB; não houve falha de build associada.

A atualização documental posterior a esse head precisa de CI própria verde antes de substituir essa evidência como head final do branch.

## Escopo verificado

Permanecem liberadas como `ready`:

- Visão geral;
- Operação;
- Sistemas;
- Auditoria;
- Configurações.

Continuam `planned`:

- Publicações;
- Páginas.

A atualização visual não introduziu operações de escrita, não integrou artificialmente nenhum sistema independente e não alterou regras de negócio.

## Fundação preservada

A release e a atualização visual não reconstruíram nem substituíram:

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

Não houve alteração de tenant, app registration, redirect URI, grupos, roles ou permissões Microsoft.

## Verificação da release original — PR #48

Workflow do PR:

`32885247605` — **success**.

Concluído com sucesso:

- instalação locked de dependências;
- formatação;
- lint;
- typecheck;
- contrato semântico;
- testes;
- build;
- segurança dos workflows com actionlint e zizmor.

`Deploy production` e `Verify recovery after deploy` permaneceram `skipped` no PR, como projetado.

Workflow pós-merge:

`32885417365` — **success**.

Todos os quatro jobs concluíram com sucesso:

- `Validate GitHub Actions security`;
- `Validate application`;
- `Deploy production`;
- `Verify recovery after deploy`.

Artefato de recovery da release original:

- nome: `recovery-verification-32885417365`;
- ID: `9577448564`;
- digest: `sha256:8a4d5bb690da10021aff5880456dc7155f6e41a53bfde7ee5a5e1abd7c94cd5c`.

## Verificação da atualização visual — PR #50

### Mudanças verificadas

O PR #50 realizou substituição e remoção de código visual antigo, sem empilhar camadas de compatibilidade.

Foi confirmado:

- remoção física de `src/components/ambient-constellation.tsx`;
- remoção física de `src/components/ambient-constellation.css`;
- ausência de `AmbientConstellation` e `ambient-constellation` no código ativo;
- remoção dos hooks visuais `pro-spectrum` e `living-aura` do shell ativo;
- fundo geral `#F4F4F5`;
- login e superfícies principais neutros;
- busca usando composição `SearchField` HeroUI;
- remoção do `v1` visual da navegação;
- sidebar e topbar alinhadas em 72 px;
- perfil usando `Avatar` e `Avatar.Fallback` HeroUI;
- autenticação, autorização e integrações preservadas.

### Contrato semântico

Durante o review foi detectado que os artefatos semânticos antigos ainda exigiam o Ambient como background. A inconsistência foi corrigida antes do merge.

Foram atualizados:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

Fingerprint corrente:

`d363edbc202a646a98c078cc3aee9fc69eec87aec5c8d61802258864a5186c89`

As regras vivas `INV-015`, `AC-017` e `REQ-017` agora exigem que Ambient Constellation e seus hooks visuais permaneçam ausentes da interface ativa.

### CI final do PR #50

Workflow:

`32892522700` — run `#416` — **success**.

Resultados:

- `Validate application` — **success**;
- `Validate GitHub Actions security` — **success**;
- formatting — **success**;
- lint — **success**;
- typecheck — **success**;
- semantic check — **success**;
- testes — **success**;
- build — **success**.

O review que apontou a inconsistência semântica foi respondido e resolvido somente depois da correção e do CI verde.

### Pós-merge do PR #50

Commit integrado:

`9ae6c49bbfe5f57577537ff480dfc833bddaad8a`

Workflow:

`32892663858` — run `#417` — **success**.

Jobs:

- `Validate application` — **success**;
- `Validate GitHub Actions security` — **success**;
- `Deploy production` — **success**;
- `Verify recovery after deploy` — **success**.

O deploy Cloudflare Pages recebeu o commit exato `9ae6c49bbfe5f57577537ff480dfc833bddaad8a`.

### Recovery do PR #50

O job pós-deploy confirmou:

- rebuild da fonte implantada;
- round trip descartável de backup/restore SharePoint;
- cleanup do recurso temporário;
- publicação de evidência redigida.

Artefato:

- nome: `recovery-verification-32892663858`;
- ID: `9580090126`;
- tamanho: `429 bytes`;
- digest: `sha256:1e9aec7d3bc7f6fa51590c3c56b17953f7907ac1f701797b919ea6b39d52b552`;
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
- a atualização visual não ampliou capabilities para professores ou outros perfis não administrativos.

## Verificação de acabamento de produção

O PR #48 removeu linguagem e artefatos de candidata/validação da experiência comum.

O PR #50 completou a limpeza visual removendo o Ambient Constellation e padronizando o shell HeroUI neutro.

Testes de regressão relevantes:

- `tests/production-release.test.ts`;
- `tests/ui-hardening.test.ts`.

Eles protegem, entre outros pontos:

- `releaseState = production`;
- versão `1.0.0`;
- áreas liberadas em `ready`;
- Publicações/Páginas em `planned`;
- ausência de linguagem de validação/desenvolvimento proibida;
- ausência dos arquivos e hooks ativos do Ambient;
- fundo neutro previsto;
- ausência do `v1` visual;
- SearchField e Avatar HeroUI previstos.

## Verificação de UI e interação corrente

As garantias correntes são:

- perfil HeroUI com `Avatar`, `Dropdown` e logout;
- busca inline desktop/mobile com `SearchField`;
- `Ctrl/Cmd + K` para foco da busca;
- `Escape` para fechamento;
- navegação e fechamento do resultado na mesma interação;
- breadcrumbs e tabelas responsivas;
- `Table.ScrollContainer` nas tabelas estruturadas;
- fundo geral neutro `#F4F4F5`;
- Ambient Constellation ausente da interface ativa;
- reduced-motion respeitado para movimentos não essenciais restantes.

## Governança da main

A branch `main` permanece protegida.

Checks obrigatórios:

- `Validate application`;
- `Validate GitHub Actions security`.

O PR #50 foi integrado somente depois desses gates passarem e de todos os threads de review estarem resolvidos.

## Baseline histórica

### PR #45

Hardening funcional final antes da promoção:

- commit: `f59cf4bcf6815ef57edc9eb4558e09a08f93aedd`;
- workflow: `32877197391` — **success**.

O Ambient fazia parte daquela composição visual histórica, mas foi removido pelo PR #50 sem desfazer as garantias funcionais do hardening.

### PR #46

Sincronização documental pré-release:

- commit: `6660ce1960c7dbeb8cef7a1f073a9c3d8e832e6b`.

### Specs semânticas

Os arquivos `specs/semantic-contract.json`, `specs/semantic-assurance.json` e `specs/verification-plan.json` são contratos versionados vivos. Eles foram evoluídos explicitamente no PR #50 para refletir a nova regra de ausência do Ambient, em vez de deixar o código contradizer a garantia declarada.

## Performance e otimização futura

O build ainda pode emitir warning de chunk JavaScript acima de `500 kB` minificado.

Ele permanece não bloqueador porque os gates, testes e build passam no PR; em produção existente, deploy e recovery já foram comprovados pelas releases anteriores. Uma futura decisão de code splitting deve usar métricas de carregamento inicial e não apenas o limite estático do bundler.

## Resultado final do Centro em produção

**CENTRO V1 EM PRODUÇÃO E ATUALIZAÇÃO VISUAL PR #50 IMPLANTADA.**

- estado: `production`;
- versão: `1.0.0`;
- release original: PR `#48`;
- atualização visual: PR `#50`;
- commit corrente de produção: `9ae6c49bbfe5f57577537ff480dfc833bddaad8a`;
- workflow corrente de produção: `32892663858` — **success**;
- deploy: **success**;
- recovery: **verified**;
- autorização administrativa: preservada e fail closed;
- Ambient Constellation: **removido da interface ativa**;
- Publicações/Páginas: não liberadas.

Qualquer mudança futura material em regra, fluxo, dados, autorização, segurança ou comportamento observável deve entrar por novo PR e receber regressão proporcional.

## Banco de Notas — Fase 1 + grade-events no PR #52

A fundação executável e o hardening estão cobertos por testes dedicados de migration SQLite/D1, autoridade temporal, integridade cross-year, ausência versus zero, idempotência/sequence, contrato do módulo, API allow/deny, Origin, shell path-based, edição segura de vigência e isolamento dos golden masters privados.

O bloco de grade-events acrescentou:

- OpenAPI/AsyncAPI definitivos no mesmo origin do Centro;
- contrato tipado de eventos, receipts e snapshots;
- hash de payload associado à idempotência;
- snapshot por `(gradeKey, field)`;
- stale auditável sem regressão de snapshot;
- store D1 com validação de fonte, modelo, ambiente, autoridade, sync e mapeamento de célula;
- batch transacional evento + snapshot;
- regressão Node/SQLite real do store.

No head funcional `94ccceff31d6355b8ce6eaa396eba16e2ecd1932`, run `32911996770` / `#495`, o pipeline passou security, format, lint, typecheck, semantic check, **167/167 testes** e build. `Deploy production` e `Verify recovery after deploy` ficaram corretamente `skipped`.

Limites explícitos dessa evidência:

- SQLite real não substitui Cloudflare D1 remoto;
- regressão estrutural de deep-link não substitui browser QA real;
- D1 de homologação ainda não foi provisionado;
- registro SharePoint ainda não foi aplicado ao tenant;
- endpoint do add-in ainda não foi exposto;
- audience/scope Entra do add-in ainda não foram provisionados;
- não houve merge ou deploy de produção do Banco.

O endpoint de grade-events deve continuar fechado ao add-in até existir autenticação bearer Entra própria. Não reutilizar cookie administrativo do Centro nem inventar audience, scope ou client secret.

## Referências

- estado atual: `PROJECT_STATE.md`;
- estado do Banco: `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
- handoff do Banco: `docs/BANCO_NOTAS_HANDOFF.md`;
- evidência da release: `docs/RELEASE_CENTRO_ADMIN_V1_2026-08-25.md`;
- evidência da atualização visual: `docs/PRODUCTION_VISUAL_CLEANUP_PR50_2026-08-25.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- hardening Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`.
