# PROJECT_STATE — Ecossistema Escolar

## Banco de Notas — Central de Pendências V1 (28/08/2026)

- Branch `feat/banco-notas-central-pendencias-v1`, baseada na `main` integrada em `5e6d7cfd0b010da7f34c0044eca5ce704a06d429`.
- Visão operacional read-only em `/banco-de-notas/pendencias`, com resumo, filtros/paginação server-side, detalhe e navegação contextual.
- Tipos limitados derivados de importações, findings, modelos, identidade quando necessária, fontes efetivas e assignments persistidos.
- Classificação equivalente reutiliza `deriveOperationalAttention`; `sync_enabled=0` isoladamente não é erro.
- APIs exigem `grades.analytics.read`; DTO minimizado sem token, OID, Graph/Drive ID, caminho de storage ou detalhes SQL.
- Gate local: 403 testes em 80 arquivos, formatação/lint/tipos/semântica/manifest/builds verdes, audit high com 0 vulnerabilidades e Browser QA desktop/mobile aprovado.
- Nenhuma migration, D1 remoto, Graph, Entra, add-in, sync ou produção foi alterada.
- Documento: `docs/BANCO_NOTAS_CENTRAL_PENDENCIAS_V1.md`.

## Banco de Notas — Professores V1 (28/08/2026)

- Branch funcional `feat/banco-notas-professores-v1`, baseada na `main` integrada em `0d61a96e4c7567d565548ac6bedcc9b9c1c5c6c1`.
- Diretório e detalhe operacional read-only de professores, com filtros/paginação server-side, identidade institucional segura, assignments, turmas/componentes, teacher models, fontes, pendências e atividade.
- Regra de situação operacional compartilhada com Acompanhamento; `sync_enabled=0` isoladamente não é erro.
- Navegação Professor ↔ Turma e Professor ↔ Acompanhamento com retorno preservado.
- Contratos semânticos e OpenAPI atualizados; nenhum schema D1, Entra, Graph, add-in ou produção foi alterado.
- Verificação local: 372 testes em 72 arquivos, lint, tipos, semântica e builds verdes; browser QA desktop/mobile sintético aprovado, incluindo retorno seguro de Turmas/Acompanhamento.
- Documento: `docs/BANCO_NOTAS_PROFESSORES_V1.md`.

## Adoção App Factory e novo marco — Banco de Notas

Em 25/08/2026 foi aberto o branch `feat/banco-de-notas-foundation`, a partir de `b2f743543f7365e591120b2363b5f274bf314cb0`, para iniciar o primeiro sistema especializado integrado ao Centro: **Banco de Notas**.

Estado deste trabalho no PR #52: **Fase 1 consolidada e avanço do núcleo de importação/modelo genérico, sem merge ou deploy**. Além da adoção App Factory V1.4 e dos contratos prévios, o branch possui manifesto/capabilities, migrations e repositório D1, APIs iniciais, autoridade temporal de fontes, rota `/banco-de-notas`, shell HeroUI, `Configurações > Fonte`, grade-events interno, gate bearer fail closed, import jobs auditáveis, resolução append-only de blockers, geração determinística de instância genérica, layout físico versionado com posição escolar canônica e análise verificada persistente de importações. A passagem `draft → analyzed` exige artefato `import_analyses` imutável e não pode ser acionada pela transição administrativa genérica. D1 de homologação, XLSX cloud, ciclo Graph/SharePoint/Excel Online e NAA real foram comprovados; o sync e a rota pública do add-in continuam desligados, e a produção corrente do Centro permanece inalterada.

Base funcional verificada antes desta sincronização documental: head `88ea66896271408d57343c046d81b5d042b7810f`, workflow `32924002605` / run `#600` — **success**, com segurança de Actions, formatting, lint, typecheck, semantic contract, **229/229 testes em 39 arquivos** e build. `Deploy production` e `Verify recovery after deploy` ficaram `skipped`, como esperado para PR.

Decisões duráveis já registradas:

- repositório definitivo: `mcpmieda/ecossistema-escola`;
- módulo same-origin em `/banco-de-notas` e API `/api/banco-notas/v1/*`;
- HeroUI React v3 como design system de 100% do Banco de Notas;
- shadcn/ReUI não entram no módulo;
- Ambient Constellation permanece proibido, em coerência com a limpeza visual de produção do PR #50;
- fontes configuráveis: `legacy_import` e `linked_teacher_model`, com autoridade explícita por professor/ano durante migração;
- Cloudflare D1 como persistência transacional estruturada do Banco;
- SharePoint/OneDrive para arquivos mestre/modelos e Microsoft Graph pelo backend;
- Cloudflare Queues somente para trabalho assíncrono real;
- add-in Office.js como fonte primária de baixa latência do novo modelo vinculado;
- `SyncEnabled=false` por padrão até reconciliação individual;
- GitHub é fonte técnica de construção/continuidade, nunca dependência de runtime;
- `draft → analyzed` exige análise backend verificada, proveniência coerente e artefato imutável persistido; não é uma transição administrativa genérica;
- o produto usará um modelo genérico limpo; os arquivos privados de Nina e Alanna são somente golden masters de homologação e nunca integram runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição;
- a transformação de legado deve ser geral para qualquer professor e não pode depender de nomes, quantidade de abas, turmas, disciplinas ou particularidades dos golden masters privados;
- layout físico do modelo é parte versionada da definição, com `layoutVersion`, linha inicial e colunas por campo;
- posição escolar dos alunos é dada pela correspondência canônica e não por ordenação de UUID ou pela ordem acidental do workbook legado.

Fontes privadas de produto e integração auditadas: `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado`, `Dossie_Tecnico_Modelo_Professor_Integracao_Banco_de_Notas_v1.0` e `Plano_Mestre_antigo_antes_do_dossie.Reconstrucao_Planilha_Banco_de_Notas_v0.3`. O terreno de POC em `mcpmieda/escolaieda` foi auditado no commit `211251908efe078a8b75396e71e94827293da860`; código/contratos válidos serão migrados, mas o Banco definitivo continuará neste repositório.

Continuidade: `AGENTS.md`, `.app-factory.json`, `docs/BANCO_NOTAS_ARCHITECTURE_V1.md`, `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`, `docs/BANCO_NOTAS_HANDOFF.md` e `specs/banco-notas/`.

Esta abertura de trabalho **não altera a release atual em `main` nem libera o Banco de Notas em produção**.

<!-- APP-FACTORY:ADOPTION:START -->

## App Factory Adoption

- governance: `app-factory`;
- factory baseline: `v1.4.0`;
- adoption mode: `existing`;
- scale: `L`;
- risk: `high`;
- system level: `production-system`;
- profile: `web-admin`;
- API mode: `governed`;
- Semantic Verification: `required` / depth `domain`;
- Independent Verification: `release`;
- authoritative data: Cloudflare D1 para dados transacionais estruturados, snapshots, configuração versionada e auditoria do Banco; SharePoint/OneDrive para arquivos mestre genéricos e instâncias; Entra ID para identidade;
- identity: Microsoft Entra ID pela autenticação/BFF existente; add-in com audience/scope próprio antes do piloto;
- authorization: capabilities aplicadas no servidor; navegador sem acesso direto a SharePoint/Graph para dados de negócio;
- recovery: migrations e Time Travel D1, versões SharePoint das instâncias, hashes das origens e reconciliação;
- design system: `HeroUI React v3`;
- Professional UI Profile: `professional-default`;
- Motion Profile: `ambient`;
- UI deviation: Ambient Constellation é proibido por decisão explícita de produto; motion limita-se a transições e microinterações sem superfície ambient.

A implementação material exige o Project Adoption Gate de pré-implementação verde ou checklist equivalente comprovada quando o validador não representar uma exceção explícita aceita pelo contrato.
<!-- APP-FACTORY:ADOPTION:END -->

## Estado atual

O Centro de Administração v1 está **oficialmente em produção** no domínio:

`https://admin.escolaieda.com`

Estado corrente em `main`:

- PR de release original: `#48 — Release — Centro de Administração v1 para produção`;
- commit da release original: `c605089d024d584a85ef81dab986a31bee5e4a22`;
- atualização visual de produção: `#50 — Visual — limpar Ambient e padronizar shell HeroUI`;
- commit corrente após a atualização visual: `9ae6c49bbfe5f57577537ff480dfc833bddaad8a`;
- versão do núcleo: `1.0.0`;
- release state: `production`;
- design system: HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- produção oficial: **autorizada, implantada e atualizada**.

A autorização humana formal ocorreu pelo comando exato `APROVADO PARA PRODUÇÃO`, conforme o protocolo institucional de liberação.

## Escopo liberado

Estão liberadas como áreas do núcleo administrativo:

- Visão geral;
- Operação;
- Sistemas;
- Auditoria;
- Configurações.

O primeiro sistema especializado, **Banco de Notas**, já está em implementação real no PR #52 e não deve mais ser tratado como uma integração futura inexistente. Entretanto, ele **ainda não integra a release de produção** enquanto o PR permanecer draft e os gates externos de homologação não forem executados.

Continuam deliberadamente adiados e não foram artificialmente ativados:

- módulo `Publicações`;
- módulo `Páginas`.

Essas áreas futuras permanecem como planejadas e não executam operações de negócio.

## Fundação preservada

A liberação v1 e a atualização visual posterior preservam a infraestrutura e os controles já existentes:

- Microsoft Entra ID;
- BFF e cookie HttpOnly selado;
- autorização server-side por capabilities;
- grants administrativos fail closed;
- grupos e roles institucionais;
- automação cargo → grupos;
- Microsoft Graph e permissões existentes;
- SharePoint `CENTROADMIN`;
- Cloudflare Pages;
- CI/CD permanente;
- recovery técnico pós-deploy;
- rotação automática da identidade técnica;
- contratos modulares e semânticos;
- regras institucionais e fontes de dados existentes.

Nenhuma nova permissão, grupo, tenant, app registration, redirect URI ou infraestrutura foi criada para a promoção de produção nem para a atualização visual do PR #50.

## Acabamento de produção — PR #48

O PR #48 promoveu a candidata validada para produção sem criar nova regra de negócio.

Principais mudanças:

- `releaseState`: `validation` → `production`;
- versão do núcleo: `0.8.0-validation` → `1.0.0`;
- áreas administrativas aprovadas: `validation` → `ready`;
- remoção do banner `Ambiente de validação`;
- remoção do aviso `Centro em validação controlada`;
- substituição de linguagem de candidata/capabilities/BFF/HealthEndpoint por linguagem administrativa quando aparecia na experiência comum;
- simplificação da tela de acesso negado sem alterar o bloqueio fail closed;
- remoção de IDs e detalhes técnicos desnecessários da visualização de Sistemas;
- remoção de correlation ID e versão técnica do rodapé comum;
- preservação de correlation ID onde ele é útil para erro, auditoria e suporte;
- remoção do CSS temporário associado ao banner de validação;
- adição de teste específico de release para impedir regressão de linguagem de validação/desenvolvimento na interface.

## Atualização visual de produção — PR #50

O PR #50 realizou uma limpeza visual pós-release sem alterar regras funcionais, autenticação, autorização ou integrações.

Principais mudanças:

- remoção física de `src/components/ambient-constellation.tsx` e `src/components/ambient-constellation.css`;
- remoção dos hooks ativos de Ambient Constellation, `pro-spectrum` e `living-aura`;
- fundo geral neutralizado em `#F4F4F5`;
- login e superfícies principais neutralizados;
- busca recomposta com `SearchField` HeroUI nativo;
- remoção do `v1` visual da navegação;
- sidebar e topbar alinhadas em 72 px;
- perfil e menu padronizados com `Avatar`/`Avatar.Fallback` HeroUI;
- regressões adicionadas em `tests/ui-hardening.test.ts` para impedir o retorno do Ambient e do `v1` visual;
- `specs/semantic-contract.json`, `specs/semantic-assurance.json` e `specs/verification-plan.json` sincronizados para exigir a ausência do Ambient na interface ativa.

Fingerprint semântico corrente:

`d363edbc202a646a98c078cc3aee9fc69eec87aec5c8d61802258864a5186c89`

## Gates da release oficial

### PR #48

Workflow do PR:

`32885247605` — **success**.

Gates obrigatórios concluídos:

- `Validate application` — **success**;
- `Validate GitHub Actions security` — **success**.

Como previsto, `Deploy production` e `Verify recovery after deploy` ficaram `skipped` no PR e só executaram após merge em `main`.

### Pós-merge da release em main

Workflow oficial da release:

`32885417365` — run `#404` — **success**.

Jobs concluídos com sucesso:

- `Validate GitHub Actions security`;
- `Validate application`;
- `Deploy production`;
- `Verify recovery after deploy`.

O deploy da release foi executado a partir do commit exato `c605089d024d584a85ef81dab986a31bee5e4a22`.

Cloudflare Pages confirmou a implantação e publicou a revisão em:

`https://6dc1c75e.ecossistema-escola.pages.dev`

O domínio institucional oficial permanece:

`https://admin.escolaieda.com`

## Gates da atualização visual — PR #50

Workflow final do PR:

`32892522700` — run `#416` — **success**.

Gates do PR concluídos:

- `Validate application` — **success**;
- `Validate GitHub Actions security` — **success**;
- format, lint, typecheck, semantic check, testes e build — **success**.

Workflow pós-merge em `main`:

`32892663858` — run `#417` — **success**.

Jobs concluídos com sucesso:

- `Validate GitHub Actions security`;
- `Validate application`;
- `Deploy production`;
- `Verify recovery after deploy`.

O deploy corrente foi executado a partir do commit exato:

`9ae6c49bbfe5f57577537ff480dfc833bddaad8a`

## Recovery pós-deploy

### Release original

O job `Verify recovery after deploy` da release original concluiu com sucesso:

- rebuild da fonte publicada;
- round trip descartável de backup/restore SharePoint;
- cleanup do recurso descartável;
- publicação de evidência redigida.

Artefato da release original:

- nome: `recovery-verification-32885417365`;
- artifact ID: `9577448564`;
- digest: `sha256:8a4d5bb690da10021aff5880456dc7155f6e41a53bfde7ee5a5e1abd7c94cd5c`;
- retenção prevista até `2026-11-23`.

### Atualização visual PR #50

O recovery pós-deploy da atualização visual também concluiu com sucesso.

Artefato:

- nome: `recovery-verification-32892663858`;
- artifact ID: `9580090126`;
- tamanho: `429 bytes`;
- digest: `sha256:1e9aec7d3bc7f6fa51590c3c56b17953f7907ac1f701797b919ea6b39d52b552`;
- expiração prevista: `2026-11-23`.

Essas evidências comprovam o self-test técnico previsto pelo projeto; não representam declaração de disaster recovery completo de todos os dados operacionais.

## Segurança e governança

A branch `main` permanece protegida.

Checks obrigatórios confirmados:

- `Validate application`;
- `Validate GitHub Actions security`.

A proteção continua aplicada a todos, inclusive administração, conforme a política atual. Force push e exclusão de `main` continuam fora do fluxo normal de desenvolvimento.

Usuários sem autorização administrativa permanecem bloqueados por autorização server-side; nem a promoção para produção nem a atualização visual ampliaram o conjunto de capabilities ou roles autorizadas.

## Histórico relevante

### Hardening final — PR #45

O PR #45 foi a baseline funcional que recebeu o hardening final de autenticação, busca, perfil e mobile. Naquele momento, o Ambient Constellation ainda fazia parte da apresentação visual; essa decisão visual foi posteriormente substituída pelo PR #50, sem reverter o hardening funcional.

Commit histórico:

`f59cf4bcf6815ef57edc9eb4558e09a08f93aedd`

Workflow histórico:

`32877197391` — **success**.

### Documentação pré-release — PR #46

O PR #46 sincronizou a documentação antes da autorização oficial.

Commit histórico:

`6660ce1960c7dbeb8cef7a1f073a9c3d8e832e6b`

Esse commit não alterou runtime.

### Contrato semântico

Os arquivos em `specs/` nasceram na fase de hardening/validação e continuam sendo o contrato semântico versionado do Centro. No PR #50 eles foram evoluídos de forma explícita para refletir a remoção do Ambient Constellation, com novo fingerprint e mantendo as garantias funcionais e de segurança existentes.

A condição viva de release continua sendo registrada por `PROJECT_STATE.md`, `VERIFICATION.md`, pelo contrato de runtime, pelos testes de produção e pelas evidências de workflow pós-merge.

## Build e otimização futura

O Vite ainda pode emitir warning para chunk JavaScript acima de `500 kB` minificado.

Isso permanece classificado como otimização futura, não como falha da release v1, porque:

- os gates obrigatórios passaram;
- testes e build concluíram com sucesso;
- deploy e recovery concluíram com sucesso;
- não há evidência de regressão funcional associada ao warning.

Code splitting deve ser decidido com métricas específicas de carregamento inicial.

## App Factory

As lições reutilizáveis de overlays, navegação e QA permanecem incorporadas à App Factory pelo PR `#57 — HeroUI — endurecer overlays, navegação e QA de interação`, commit:

`21d12063b1064bb5f9ccefd8b0f450f318ab9af4`.

## Próximo marco

A fundação do Centro de Administração v1 permanece encerrada como release oficial e a limpeza visual do shell está concluída em produção.

O primeiro sistema especializado já está em implementação no PR #52. D1 remoto de homologação, XLSX cloud, Graph/SharePoint e identidade NAA real já fecharam seus gates específicos. O próximo marco seguro é provar bearer/ownership e atomicidade no runtime Cloudflare de homologação explicitamente autorizado, mantendo `SyncEnabled=false`, a rota pública desconectada e a produção intocada.

`Publicações` e `Páginas` permanecem fora da release v1 até priorização específica.

Qualquer mudança futura material em comportamento, dados, autorização, segurança ou experiência deve entrar por novo PR e nova regressão proporcional.

## Referências internas

## Banco de Notas — Turmas e Alunos V1 (28/08/2026)

- Branch funcional adiciona diretórios reais, detalhes e navegação cruzada com Acompanhamento.
- Roster somente pela versão mais recente dos mappings canônicos, gradeKey exata e deduplicação por ano + turma + aluno.
- Sem matrícula paralela ou CRUD; aluno sem relação comprovada continua na pesquisa global.
- API read-only com `grades.analytics.read`, filtros e paginação server-side.
- Produção, D1 remoto, Graph, Entra e add-in intocados; `sync_enabled=0`.

Referência: `docs/BANCO_NOTAS_TURMAS_ALUNOS_V1.md`.

Publicação atual: PR Draft #134, sem merge; CI/Actions Security/Semgrep verdes na primeira rodada; produção e jobs de deploy/recovery intactos/skipped.

- verificação da release e atualizações: `VERIFICATION.md`;
- estado do Banco de Notas: `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
- handoff do Banco de Notas: `docs/BANCO_NOTAS_HANDOFF.md`;
- evidência da release: `docs/RELEASE_CENTRO_ADMIN_V1_2026-08-25.md`;
- evidência da limpeza visual: `docs/PRODUCTION_VISUAL_CLEANUP_PR50_2026-08-25.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- arquitetura: `ARCHITECTURE.md`;
- redesign Native v2: `docs/REDESIGN_HEROUI_NATIVE_V2.md`;
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

## Atualização de produto — Acompanhamento V1 (28/08/2026)

O Banco de Notas agora possui, em branch de produto separada, o primeiro módulo diário read-only: Acompanhamento. A implementação consome D1, usa a autorização administrativa atual, preserva filtros na URL e oferece lista/detalhe com estados reais de turmas, professores, modelos, fontes, notas disponíveis e pendências. Ainda não há autorização para produção ou merge.

## Integração controlada — Fundação + Acompanhamento V1 (28/08/2026)

- A fundação técnica foi integrada à `main` pelo PR #52 no merge `cf48d837556fe6df1baaa21d0e0015e4535efe87`.
- O Acompanhamento V1 foi retargetado para `main`; a integração deste registro pelo PR #129 consolida o primeiro módulo diário read-only.
- Os merges usam `[skip ci]` exclusivamente para impedir o workflow automático de deploy em pushes para `main`; todos os gates dos PRs são exigidos antes da integração.
- Produção, D1 remoto, Entra, permissões Graph e publicação do add-in permanecem inalterados; `sync_enabled=0`.
- Próxima fase funcional autorizável separadamente: Turmas e Alunos V1.

## Pesquisa Global V1 — implementação em branch (28/08/2026)

- Branch `feat/banco-notas-pesquisa-global-v1`, baseada na `main` em `8eed2e9bc00ff4d53749f4c1ac630bf0f182fa52`.
- Pesquisa read-only de alunos, professores e turmas por IDs e relacionamentos canônicos já persistidos.
- API protegida por `grades.analytics.read`, com normalização e ranking determinístico no servidor, limites e totais por tipo.
- UI HeroUI em `/banco-de-notas/pesquisa`, com URL, debounce, cancelamento, teclado e navegação cruzada.
- Sem migration, índice/identidade paralelos, FTS, IA, fuzzy matching, write ou ranking no frontend.
- Produção, D1 remoto, Graph, Entra, add-in e sync permanecem intocados; publicação autorizada somente como PR Draft, sem merge.
- Gate local e Browser QA sintético concluídos; PR Draft #136 publicado, com primeira rodada de CI/security/Semgrep verde e zero deployments. O PR deve permanecer Draft e sem merge.

Documento: `docs/BANCO_NOTAS_PESQUISA_GLOBAL_V1.md`.
