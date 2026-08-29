# VERIFICATION — Centro de Administração v1

## Banco de Notas — verificação Professores V1 (28/08/2026)

- Lista, pesquisa, filtros, paginação, detalhe, assignments, turmas/componentes, modelos, identidade, situação operacional, pendências e atividade: PASS local.
- APIs read-only protegidas por `grades.analytics.read`, queries validadas e DTO sem OID/Drive ID: PASS.
- Repositório D1 agregado sem N+1, latest model persistido e professores sem assignment preservados: PASS.
- Regressão de Acompanhamento, Turmas e Alunos: PASS.
- Testes: 372 em 72 arquivos, incluindo 19 novos testes focados: PASS.
- Lint, typecheck, semantic contract, manifest e builds web/add-in: PASS.
- Browser QA sintético: desktop 1440 × 900 e mobile 390 × 844; navegação cruzada, retorno seguro para Turmas/Acompanhamento e filtros da lista, vazio, 403, 404 e 500: PASS.
- Fixture local e servidor temporário removidos; nenhuma PII real em evidências.
- Produção, D1 remoto, Graph e Entra intactos; add-in não publicado; `sync_enabled=0`.

Evidência detalhada: `docs/BANCO_NOTAS_PROFESSORES_V1.md`.

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

## Banco de Notas — verificação corrente do PR #52

### Importação/modelo genérico — 25/08/2026

Na base funcional `88ea66896271408d57343c046d81b5d042b7810f` do PR #52, o workflow `32924002605` / run `#600` concluiu com:

- `Validate GitHub Actions security` — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic check — success;
- testes — **229/229 em 39 arquivos**;
- build — success;
- `Deploy production` — skipped;
- `Verify recovery after deploy` — skipped;
- warning histórico de chunk acima de 500 kB, sem falha.

A evidência atual cobre, além da fundação já consolidada:

- bearer Entra fail closed, ainda sem roteamento público do add-in;
- geração determinística do modelo genérico e bloqueio de plano incompleto/ambíguo;
- import jobs com state machine, blockers reais e resolução auditável por stream append-only separado;
- migrations SQLite reais para integridade cross-year, state machine, resolução de findings e análise persistente;
- `0005_banco_notas_import_analysis.sql`, com `import_analyses` append-only e exigência de artefato antes de `analyzed`;
- pipeline `analyzeImportJob` que valida hash/formato/ano da origem, usa o boundary verificado de workbook e persiste análise/findings/auditoria/estado atomicamente;
- retry idempotente de análise sem duplicação e conflito em retry incompatível;
- endpoint administrativo de transição bloqueando `targetState=analyzed`, que fica reservado ao pipeline verificado;
- orquestração Graph abstrata com compensação explícita de share/upload em caso de falha;
- layout físico do modelo versionado na definição, sem mapa de colunas escondido no gerador;
- `studentPosition` como posição escolar canônica, sem ordenação de UUIDs;
- validação exata de linha/coluna da célula gerada contra o layout versionado;
- bloqueio de posições duplicadas de alunos dentro da mesma turma.

No branch `feat/banco-de-notas-foundation`, continua registrada a separação obrigatória entre produto e homologação privada:

- o produto usará um modelo genérico limpo;
- golden masters Nina/Alanna permanecem externos e privados;
- esses arquivos não podem entrar em runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição;
- regressão privada nesses casos é evidência complementar, não permissão para especializar o produto;
- generalização exige fixtures sintéticas variadas e ausência de dependências por professor/abas/turmas/disciplinas/células específicas.

O transformador/planner, a instância genérica e a análise persistente existem em código e estão cobertos por regressão sintética/SQLite. Desde a evidência histórica desta seção, D1 de homologação, XLSX cloud, Graph/SharePoint e NAA real no Excel Online também foram comprovados e documentados. Isso não equivale a deploy ou sync de produção, que continuam ausentes.

## Escopo verificado

Permanecem liberadas como `ready` no núcleo de produção:

- Visão geral;
- Operação;
- Sistemas;
- Auditoria;
- Configurações.

Continuam `planned`:

- Publicações;
- Páginas.

O Banco de Notas está em implementação real no PR #52, mas ainda não integra a release de produção.

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

Não houve alteração de tenant, app registration, redirect URI, grupos, roles ou permissões Microsoft na produção corrente.

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

## Banco de Notas — Fase 1 + importação/modelo genérico no PR #52

A fundação executável e o hardening estão cobertos por testes dedicados de migration SQLite/D1, autoridade temporal, integridade cross-year, ausência versus zero, idempotência/sequence, contrato do módulo, API allow/deny, Origin, shell path-based, edição segura de vigência e isolamento dos golden masters privados.

O estado implementado também inclui:

- OpenAPI/AsyncAPI definitivos de grade-events no mesmo origin do Centro;
- contrato tipado de eventos, receipts e snapshots;
- hash de payload associado à idempotência;
- snapshot por `(gradeKey, field)` e stale auditável sem regressão;
- store D1 com validação de fonte, modelo, ambiente, autoridade, sync e mapeamento de célula;
- bearer Entra fail closed preparado; audience/scope reais já homologados, mas a rota pública continua desconectada;
- import jobs com idempotência, proveniência, findings e state machine protegida no storage;
- stream append-only separado para resolução auditável de findings;
- artefato `import_analyses` append-only, preso a hash/formato/ano/analyzer/version da análise;
- bloqueio de `analyzed` no storage quando não existe artefato de análise;
- orquestração `analyzeImportJob` com commit transacional de análise, findings, auditoria e estado;
- transição administrativa genérica impedida de alcançar `analyzed`;
- planner de transformação genérico com bloqueio de correspondências ausentes/ambíguas;
- `GenericModelInstance` determinística em homologação e com sync desligado;
- layout físico versionado com `layoutVersion`, `firstStudentRow` e coluna por `gradeField`;
- posição escolar canônica via `studentPosition` e bloqueio de posição duplicada na turma;
- validação exata de célula contra layout/posição;
- boundary Graph com store/share/metadata/audit e compensação explícita em falha.

Na base funcional `88ea66896271408d57343c046d81b5d042b7810f`, run `32924002605` / `#600`, o pipeline passou security, format, lint, typecheck, semantic check, **229/229 testes em 39 arquivos** e build. `Deploy production` e `Verify recovery after deploy` ficaram corretamente `skipped`.

Limites explícitos daquela evidência histórica (os itens já fechados aparecem como tal na documentação atual do Banco):

- SQLite real não substitui Cloudflare D1 remoto;
- regressão estrutural de deep-link não substitui browser QA real;
- D1 de homologação e migrations foram comprovados posteriormente;
- ciclo SharePoint/Excel Online/Graph foi comprovado posteriormente e limpo;
- endpoint público do add-in ainda não foi exposto;
- audience/scope Entra e token NAA real foram comprovados em 27/08/2026;
- analisador/serializador XLSX cloud e adapter Graph real foram comprovados posteriormente;
- não houve sync end-to-end;
- não houve merge ou deploy de produção do Banco.

O endpoint de grade-events deve continuar fechado até uma prova bearer/ownership no runtime de homologação autorizado. A identidade Entra própria já existe; não reutilizar cookie administrativo do Centro nem criar client secret.

O serializador XLSX futuro deve consumir a definição de layout já versionada; não criar outra tabela hardcoded de colunas nem reconstruir a ordenação dos alunos por UUID ou pela ordem do arquivo legado.

## Referências

## Banco de Notas — verificação Turmas e Alunos V1 (28/08/2026)

- Repository D1 em SQLite real com migrations 0001–0007 e fixtures sintéticas.
- Cobertura dedicada de latest version, gradeKey exata, deduplicação, aluno sem vínculo, paginação, filtros, 404, auth, falha fechada e zero versus ausência.
- Regressão de Acompanhamento integra o gate local.
- OpenAPI e contrato semântico atualizados; UI HeroUI administrativa e read-only.
- Browser QA local sintético: PASS em 1440 × 900 e 390 × 844, incluindo filtros/query string, debounce, empty, detalhes, navegação cruzada, aluno sem vínculo, zero, ausência, erro, 403 e overflow horizontal contido na tabela.
- Regressão visual após refinamentos: estado parcial, 404, cabeçalho operacional, snapshot count, pendências do contexto e mobile sem overflow — PASS.
- A fixture HTTP temporária foi encerrada e removida; CI do PR Draft será registrado após publicação.
- Nenhum serviço remoto ou PII real; produção e `sync_enabled=0` intactos.
- Gate local final: `npm run verify` PASS; **353 testes em 67 arquivos**; lint, formatação, tipos, contrato semântico, manifest e builds PASS; `npm audit --audit-level=high` com 0 vulnerabilidades; `git diff --check` PASS.
- PR Draft #134, primeira rodada: CI and deploy `33199767149` PASS; Semgrep `33199767176` PASS; Validate application, Actions Security e Semgrep verdes; produção/recovery/cleanup/Merge Train skipped.
- Factory Control Plane não foi acionado porque o diff não toca os paths de Factory que disparam esse workflow; a validação de política GitHub dentro de Actions Security passou.

- estado atual: `PROJECT_STATE.md`;
- estado do Banco: `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
- handoff do Banco: `docs/BANCO_NOTAS_HANDOFF.md`;
- homologação NAA: `docs/BANCO_NOTAS_NAA_HOMOLOGATION_2026-08-27.md`;
- evidência da release: `docs/RELEASE_CENTRO_ADMIN_V1_2026-08-25.md`;
- evidência da atualização visual: `docs/PRODUCTION_VISUAL_CLEANUP_PR50_2026-08-25.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- hardening Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`.

## Homologação runtime bearer/ownership + atomicidade D1 — 28/08/2026

- Excel Online real obteve bearer delegado NAA 1.1 e o enviou ao runtime isolado em Cloudflare Pages Functions.
- Validação sanitizada aprovada para token v2, tenant, issuer, audience, scope, authorized party, lifetime e presença de OID; nenhum token, OID, conta ou PII foi persistido.
- Ownership positivo aceito; ownership incorreto, modelo inexistente e professor inativo rejeitados.
- A guarda de sync rejeitou ingestão com zero escritas enquanto desabilitada.
- O binding real BANCO_NOTAS_DB comprovou atomicidade de evento + snapshot via D1Database.batch(): caminho positivo completo e falha controlada sem escrita parcial.
- Estado final no D1 de homologação: modelo e assignment com sync_enabled=0; fixtures negativas removidas.
- Deployment isolado: 239e9bc8-d504-41e1-8d15-d2b092039872; workflow de deploy 33160734080 — success.
- Redirect SPA temporário do preview removido do Entra; dois redirects institucionais preservados; zero secrets/certificados.
- Limpeza do preview Pages: pendente neste commit e disparada pelas evidências versionadas.
- Nenhum Worker, Pages ou D1 de produção foi alterado. PR #52 permanece open, draft e sem merge.

Evidências: docs/evidence/BancoNotas-Bearer-Ownership-Homologation-2026-08-27.json e docs/evidence/BancoNotas-D1-Binding-Atomicity-Homologation-2026-08-27.json.

## Encerramento do runtime temporário — 28/08/2026

- CI `33163724110` / #1008: **success**.
- Formatting, lint, typecheck, semantic contract, validação do manifest, testes e builds: success.
- Testes: **323 passed em 59 arquivos**.
- Actions security: success.
- Semgrep `33163724064`: success.
- Factory Control Plane `33163724062`: success.
- Job `98824370212` (`Remove isolated Banco de Notas homologation runtime`): success.
- A consulta de deployments do Cloudflare retornou `RUNTIME_HOMOLOGATION_PAGES_PREVIEW_ALREADY_ABSENT` para o ID exato `239e9bc8-d504-41e1-8d15-d2b092039872`.
- O redirect SPA temporário do preview continua ausente no Entra; redirects institucionais e contrato credential-free permanecem preservados.
- `sync_enabled=0`; produção Pages, Worker e D1 não foram alterados.
- `Deploy production` e `Verify recovery after deploy`: skipped.
- PR #52 permanece open, draft e sem merge.

## Banco de Notas — Acompanhamento V1 (28/08/2026)

- API e repository: testes unitários e SQLite real com migrations 0001–0007.
- UI e contratos: testes de rotas, estados, filtros, contexto e OpenAPI.
- Browser QA: desktop e 390 × 844, reload, filtro, detalhe, retorno, empty e error, somente dados sintéticos.
- Build de produção: aprovado localmente.
- Produção, D1 remoto, Graph e add-in: não alterados.

## Integração controlada — Fundação + Acompanhamento V1 (28/08/2026)

- PR #52 integrado à `main` no merge `cf48d837556fe6df1baaa21d0e0015e4535efe87` após application validation, Actions Security, Semgrep e Factory Control Plane verdes.
- Nenhum workflow de push foi criado para o merge da fundação; deploy e recovery de produção não executaram.
- PR #129 retargetado para `main` com diff restrito aos 18 arquivos do Acompanhamento V1.
- Regressão local de integração e CI do PR #129 são gates obrigatórios antes do segundo merge.
- Produção intacta, add-in não publicado, D1 remoto não acessado e `sync_enabled=0`.

## Banco de Notas — verificação Pesquisa Global V1 (28/08/2026)

- SQLite real com migrations 0001–0007 prova consultas preparadas, roster canônico, deduplicação, contexto, ranking e limites.
- Contratos Zod/API/OpenAPI cobrem `q`, `types`, `limitPerType`, `schoolYearId`, capability e falha fechada.
- Testes de privacidade impedem external ID, OID, claims, UPN, DriveItem ID e dados de nota nos DTOs.
- UI cobre URL, debounce, abort, termo mínimo, loading, empty, error, 403, atalhos e destinos canônicos.
- Browser QA sintético passou em 1440 × 900 e 390 × 844, cobrindo query string/reload, debounce, abort real, atalhos, loading, empty, 403, 500, resultados, navegação para Aluno/Professor/Turma/Acompanhamento e ausência de overflow global.
- O destino incorreto `/acompanhamento/:id` foi detectado na QA, corrigido para `/acompanhamento/turmas/:id` e revalidado; fixture, servidor, aba e viewport temporários foram encerrados/restaurados.
- Nenhum serviço remoto de produto é necessário ou autorizado para esta verificação.
- Gate local final: `npm run verify` PASS, 386 testes em 76 arquivos, manifest e builds web/add-in PASS; audit high com 0 vulnerabilidades e diff check PASS.
- PR Draft #136, primeira rodada: CI and deploy `33221412326` PASS; Semgrep `33221412336` PASS; Validate application e Actions Security verdes; deploy/recovery/cleanup/Merge Train skipped e zero deployments.
