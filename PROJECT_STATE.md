# PROJECT_STATE — Ecossistema Escolar

## Adoção App Factory e novo marco — Banco de Notas

Em 25/08/2026 foi aberto o branch `feat/banco-de-notas-foundation`, a partir de `b2f743543f7365e591120b2363b5f274bf314cb0`, para iniciar o primeiro sistema especializado integrado ao Centro: **Banco de Notas**.

Estado deste trabalho no PR #52: **Fase 1 consolidada e avanço do núcleo de importação/modelo genérico, sem merge ou deploy**. Além da adoção App Factory V1.4 e dos contratos prévios, o branch possui manifesto/capabilities, migrations e repositório D1, APIs iniciais, autoridade temporal de fontes, rota `/banco-de-notas`, shell HeroUI, `Configurações > Fonte`, grade-events interno, gate bearer fail closed, import jobs auditáveis e geração determinística de instância genérica em homologação com sync desligado. O D1 e o registro SharePoint de homologação não foram aplicados externamente; Entra/Graph reais e browser QA permanecem bloqueados por credenciais/ambiente, e a produção corrente do Centro permanece inalterada.

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
- GitHub é fonte técnica de construção/continuidade, nunca dependência de runtime.
- o produto usará um modelo genérico limpo; os arquivos privados de Nina e Alanna são somente golden masters de homologação e nunca integram runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição;
- a transformação de legado deve ser geral para qualquer professor e não pode depender de nomes, quantidade de abas, turmas, disciplinas ou particularidades dos golden masters privados.

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

Continuam deliberadamente adiados e não foram artificialmente ativados:

- integração funcional do primeiro sistema independente;
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

O próximo avanço funcional recomendado é integrar o primeiro sistema independente ao Centro para provar o contrato modular de ponta a ponta. `Publicações` e `Páginas` permanecem fora da release v1 até priorização específica.

Qualquer mudança futura material em comportamento, dados, autorização, segurança ou experiência deve entrar por novo PR e nova regressão proporcional.

## Referências internas

- verificação da release e atualizações: `VERIFICATION.md`;
- evidência da release: `docs/RELEASE_CENTRO_ADMIN_V1_2026-08-25.md`;
- evidência da limpeza visual: `docs/PRODUCTION_VISUAL_CLEANUP_PR50_2026-08-25.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- arquitetura: `ARCHITECTURE.md`;
- redesign Native v2: `docs/REDESIGN_HEROUI_NATIVE_V2.md`;
- hardening Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`.
