# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração permanece em **validação controlada** no domínio:

`https://admin.escolaieda.com`

Candidata técnica atual em `main`:

- PR integrado: `#45 — HeroUI — hardening final de autenticação, busca e mobile`;
- commit integrado: `f59cf4bcf6815ef57edc9eb4558e09a08f93aedd`;
- design system: HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- release state: `validation`;
- produção oficial: **não autorizada**.

Estar implantado no domínio oficial não equivale à liberação oficial para usuários.

## Escopo funcional desta fase

O escopo técnico desta rodada permanece fechado. Continuam deliberadamente adiados:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

Não foi criado comportamento artificial para fontes de dados ou regras institucionais ainda inexistentes.

## Fundação preservada

O PR #45 endureceu autenticação e apresentação sem reconstruir a infraestrutura existente. Permanecem preservados:

- Microsoft Entra ID;
- BFF e cookie HttpOnly selado;
- autorização server-side por capabilities;
- grants administrativos fail closed;
- grupos e roles institucionais;
- automação cargo → grupos;
- Graph e permissões existentes;
- SharePoint `CENTROADMIN`;
- Cloudflare Pages;
- CI/CD permanente;
- recovery técnico pós-deploy;
- rotação automática da identidade técnica;
- contratos modulares e semânticos;
- regras institucionais e fontes de dados existentes.

## HeroUI Native v2 — baseline anterior

A Native v1 removeu facades/dependências shadcn/Radix. A Native v2 reconstruiu anatomias diretamente com HeroUI v3 e o PR #43 concluiu o hardening de interação, performance e acessibilidade.

Evidências históricas relevantes do PR #43 permanecem válidas como baseline anterior:

- workflow de QA `32853049680` — **success**;
- diagnóstico mobile `32853049698` — **success**, sem runtime/console errors;
- workflow de `main` `32854416111` — **success**;
- smoke externo definitivo `32855103697` — **success**.

Essas evidências não substituem os gates do PR #45; servem apenas como histórico da candidata anterior.

## Hardening final — PR #45

O PR #45 tornou o contrato desta candidata de risco **alto** e adicionou requisitos explícitos para autenticação browser-facing, header/busca e responsividade.

### Autenticação

- cada início de login cria nova transação OIDC com `state`, `nonce`, PKCE verifier e expiração;
- até quatro transações vivas podem coexistir para suportar reentrada e múltiplas abas;
- transações expiradas são descartadas;
- callbacks inválidos, incompletos ou rejeitados recuperam para uma tela amigável;
- falhas não exibem JSON cru, authorization code, token, state, nonce, verifier, cookie ou segredo;
- logs browser-facing usam categoria, etapa, status e correlation ID sem material sensível;
- token exchange permanece server-side e POST-only;
- logout limpa sessão e estado temporário de autenticação;
- rotas `/auth/*` e APIs protegidas usam política reforçada de `no-store/no-cache`.

### Header, busca e perfil

- perfil usa Avatar e Dropdown HeroUI;
- logout permanece concentrado no menu de perfil;
- busca desktop e mobile é inline no header;
- mobile não usa Drawer para pesquisa;
- `Ctrl/Cmd + K` abre/foca a busca e `Escape` fecha o estado ativo;
- resultado fecha a busca na mesma interação em que navega;
- breadcrumbs, tabelas e rodapé receberam hardening para viewports estreitas.

### Ambient Constellation

- permanece somente como background geral do shell/login/estados de acesso;
- não é montada dentro de cards, surfaces, tabelas, page headers ou blocos de conteúdo;
- reduced-motion continua respeitado.

## Integração, deploy e recovery da candidata atual

O PR #45 foi integrado por squash em `main` no commit:

`f59cf4bcf6815ef57edc9eb4558e09a08f93aedd`

Workflow de `main`:

`32877197391` — **success**.

Jobs concluídos com sucesso:

- `Validate GitHub Actions security` — actionlint e zizmor verdes;
- `Validate application` — formatting, lint, typecheck, contrato semântico, testes e build verdes;
- `Deploy production` — deploy Cloudflare Pages concluído;
- `Verify recovery after deploy` — rebuild do source publicado, round trip descartável de backup/restore SharePoint e publicação de evidência redigida concluídos.

Esse deploy continua sendo implantação controlada para validação, não autorização oficial de produção.

## Estado de segurança e release

Não existem issues abertas registradas para o repositório no momento desta sincronização documental.

A candidata atual deve continuar fail closed para usuários não autorizados. O protocolo de release permanece vinculante e nenhuma alteração documental nesta rodada muda permissões, feature flags ou comportamento do produto.

## Build e otimização futura

O warning do Vite para chunk JavaScript acima de `500 kB` minificado continua sendo uma otimização futura de carregamento inicial. Não há evidência atual de regressão funcional que justifique tratá-lo como bloqueador desta candidata.

Code splitting deve ser decidido com métricas específicas de first load, não apenas pelo warning do bundler.

## App Factory

As lições reutilizáveis do hardening de overlays, navegação e QA já foram incorporadas à App Factory no PR `#57 — HeroUI — endurecer overlays, navegação e QA de interação`, integrado em `main` no commit:

`21d12063b1064bb5f9ccefd8b0f450f318ab9af4`.

O contrato reutilizável cobre, entre outros pontos:

- semântica correta de link, ação e seleção;
- uma única fonte de estado para overlay controlado;
- fechamento do overlay na mesma interação que navega;
- QA com ponteiro real e hit-testing após animação;
- erros de runtime como gate browser-neutral;
- múltiplas amostras/mediana com thresholds derivados do SLO/baseline;
- diagnóstico do harness antes de alterar o produto;
- smoke no domínio oficial sem autenticação artificial.

## Próximo gate

Os gates técnicos da candidata `f59cf4bcf6815ef57edc9eb4558e09a08f93aedd` foram concluídos com sucesso.

O estado permanece deliberadamente:

`releaseState = validation`

A liberação oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`

Antes desse comando, a etapa restante é a validação humana da candidata publicada. Qualquer mudança material posterior em comportamento, dados, autorização, segurança ou experiência invalida a aprovação anterior e exige regressão proporcional.

## Referências internas

- redesign Native v2: `docs/REDESIGN_HEROUI_NATIVE_V2.md`;
- hardening Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`;
- histórico Native v1: `docs/REDESIGN_HEROUI_NATIVE_V1.md`;
- histórico v0.9: `docs/REDESIGN_HEROUI_V0.9.md`;
- arquitetura: `ARCHITECTURE.md`;
- verificação atual: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
