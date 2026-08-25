# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração v1 está **oficialmente em produção** no domínio:

`https://admin.escolaieda.com`

Release atual em `main`:

- PR de release: `#48 — Release — Centro de Administração v1 para produção`;
- commit de produção: `c605089d024d584a85ef81dab986a31bee5e4a22`;
- versão do núcleo: `1.0.0`;
- release state: `production`;
- design system: HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- produção oficial: **autorizada e implantada**.

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

A liberação v1 preserva a infraestrutura e os controles já existentes:

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

Nenhuma nova permissão, grupo, tenant, app registration, redirect URI ou infraestrutura foi criada para a promoção de produção.

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

## Gates da release oficial

### PR #48

Workflow do PR:

`32885247605` — **success**.

Gates obrigatórios concluídos:

- `Validate application` — **success**;
- `Validate GitHub Actions security` — **success**.

Como previsto, `Deploy production` e `Verify recovery after deploy` ficaram `skipped` no PR e só executaram após merge em `main`.

### Pós-merge em main

Workflow oficial de produção:

`32885417365` — run `#404` — **success**.

Jobs concluídos com sucesso:

- `Validate GitHub Actions security`;
- `Validate application`;
- `Deploy production`;
- `Verify recovery after deploy`.

O deploy foi executado a partir do commit exato `c605089d024d584a85ef81dab986a31bee5e4a22`.

Cloudflare Pages confirmou a implantação e publicou a revisão em:

`https://6dc1c75e.ecossistema-escola.pages.dev`

O domínio institucional oficial permanece:

`https://admin.escolaieda.com`

## Recovery pós-deploy

O job `Verify recovery after deploy` concluiu com sucesso:

- rebuild da fonte publicada;
- round trip descartável de backup/restore SharePoint;
- cleanup do recurso descartável;
- publicação de evidência redigida.

Artefato:

- nome: `recovery-verification-32885417365`;
- artifact ID: `9577448564`;
- digest: `sha256:8a4d5bb690da10021aff5880456dc7155f6e41a53bfde7ee5a5e1abd7c94cd5c`;
- retenção prevista até `2026-11-23`.

Essa evidência comprova o self-test técnico previsto pelo projeto; não representa declaração de disaster recovery completo de todos os dados operacionais.

## Segurança e governança

A branch `main` permanece protegida.

Checks obrigatórios confirmados:

- `Validate application`;
- `Validate GitHub Actions security`.

A proteção continua aplicada a todos, inclusive administração, conforme a política atual. Force push e exclusão de `main` continuam fora do fluxo normal de desenvolvimento.

Usuários sem autorização administrativa permanecem bloqueados por autorização server-side; a promoção para produção não ampliou o conjunto de capabilities ou roles autorizadas.

## Histórico relevante

### Hardening final — PR #45

O PR #45 continua sendo a baseline funcional que recebeu o hardening final de autenticação, busca, perfil, mobile e Ambient Constellation.

Commit histórico:

`f59cf4bcf6815ef57edc9eb4558e09a08f93aedd`

Workflow histórico:

`32877197391` — **success**.

### Documentação pré-release — PR #46

O PR #46 sincronizou a documentação antes da autorização oficial.

Commit histórico:

`6660ce1960c7dbeb8cef7a1f073a9c3d8e832e6b`

Esse commit não alterou runtime.

### Contrato semântico do hardening

Os arquivos em `specs/` continuam registrando o contrato técnico da fase de hardening/validação que precedeu o release. O estado vivo de liberação é definido por `PROJECT_STATE.md`, `VERIFICATION.md`, pelo contrato de runtime e pelos testes de produção adicionados no PR #48.

Uma evolução futura do contrato semântico deve ocorrer como mudança própria, sem reescrever a evidência histórica da fase que ele descreve.

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

A fundação do Centro de Administração v1 está encerrada como release oficial.

O próximo avanço funcional recomendado é integrar o primeiro sistema independente ao Centro para provar o contrato modular de ponta a ponta. `Publicações` e `Páginas` permanecem fora da release v1 até priorização específica.

Qualquer mudança futura material em comportamento, dados, autorização, segurança ou experiência deve entrar por novo PR e nova regressão proporcional.

## Referências internas

- verificação da release: `VERIFICATION.md`;
- evidência de release: `docs/RELEASE_CENTRO_ADMIN_V1_2026-08-25.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- arquitetura: `ARCHITECTURE.md`;
- redesign Native v2: `docs/REDESIGN_HEROUI_NATIVE_V2.md`;
- hardening Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`.
