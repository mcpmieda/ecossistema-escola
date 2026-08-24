# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Evoluir o Centro de Administração em blocos grandes e completos, preservando integralmente a fundação existente e mantendo a plataforma em `validation` até autorização humana explícita de produção.

Ao final de cada bloco concluído, a candidata corrente deve ser publicada em `https://admin.escolaieda.com`, mantendo acesso restrito a `ADMINISTRADOR`. O deploy serve para inspeção contínua e não equivale a liberação oficial.

## Estado

- fase corrente: `v0.4` — busca transversal + modularização do shell;
- candidata v0.4: branch `feat/centro-admin-v0.4-search-modularization`, PR #12;
- baseline visual integrada: `main@4ed273771d77119300d1f638745e5e0a69081258` — v0.3 via PR #11;
- runtime funcional do logout: `main@c87cbe8be7594a6d8e87f4d219d79de984c52599` via PR #8;
- candidata funcional v0.2: `main@6effd9e0ee8f8bbc0e5864398e3ce6e53777cbc0` via PR #4;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- nível do sistema: `production-system`;
- autenticação/autorização: Microsoft Entra ID + BFF + cookie HttpOnly selado; `ADMINISTRADOR` validado server-side;
- fonte autoritativa de dados administrativos: SharePoint `CENTROADMIN` pela integração Graph existente;
- release state: `validation`; **não é produção oficial**.

## v0.3 — fundação visual integrada

A v0.3 substituiu a camada visual v0.2 por uma base administrativa moderna com shadcn/ui real:

- Tailwind CSS v4;
- shadcn/ui;
- Radix primitives;
- Lucide icons;
- Geist;
- tokens, spacing, bordas, radius e estados consistentes;
- login, sidebar, topbar, dashboard, Sistemas, Auditoria, Configurações, estados de carregamento/erro/vazio e navegação mobile refeitos.

ReUI continua reservado para necessidade concreta de Data Grid, filtros avançados, calendário, Kanban ou outro componente complexo; não é adicionado apenas por estética.

A v0.3 preservou Entra, BFF, Graph, SharePoint, grupos, rotas, contratos, autorização e logout.

## v0.4 — busca transversal e modularização

A v0.4 reduz o acoplamento do front-end e entrega a primeira função transversal real do Centro.

### Modularização

O antigo `src/App.tsx` concentrava login, shell, navegação e todas as páginas. A v0.4 separa responsabilidades em:

- `src/platform/routes.ts` — labels, ícones e hrefs;
- `src/platform/presentation.tsx` — componentes e formatadores compartilhados;
- `src/platform/navigation.tsx` — sidebar/navegação;
- `src/platform/pages.tsx` — páginas do núcleo;
- `src/platform/search-model.ts` — índice e filtro puros da busca;
- `src/platform/search.tsx` — interface desktop/mobile da busca;
- `src/components/ui/input.tsx` — primitive local coerente com shadcn.

`src/App.tsx` passa a cuidar principalmente de identidade/sessão, carregamento do snapshot e composição do shell.

### Busca interna

A busca usa **somente o snapshot já autorizado pelo BFF**. Não cria endpoint paralelo, não consulta fonte alternativa e não amplia os dados entregues ao navegador.

Itens indexados:

- áreas do núcleo já autorizadas;
- sistemas registrados já presentes no snapshot;
- metadados de configurações já presentes no snapshot.

Itens deliberadamente não indexados:

- eventos de auditoria;
- migrações;
- valores protegidos de configuração;
- qualquer dado que não esteja no read model autorizado.

Comportamento:

- desktop: busca na topbar + atalho `Ctrl+K`/`Cmd+K`;
- mobile: busca em painel lateral;
- normalização de acentos e caixa;
- busca por termos, sem exigir frase contínua (`banco notas` encontra `Banco de Notas`);
- máximo de 7 resultados por consulta;
- sistemas direcionam para `Sistemas` e configurações para `Configurações`.

## Higiene da v0.4

- workflow temporário de limpeza removido antes do baseline final;
- dependência Playwright usada apenas no QA descartável da v0.3 removida de `package.json` e `package-lock.json`;
- `shadcn` preservado porque `src/styles.css` usa `shadcn/tailwind.css`, portanto é dependência real do build atual;
- nenhuma camada antiga de busca ou navegação foi mantida em paralelo.

## Verificação v0.4

A candidata passou por:

- format;
- lint;
- TypeScript;
- testes unitários/contratuais existentes;
- testes próprios da busca;
- build;
- actionlint;
- zizmor.

A suíte passou de 68 para 72 testes com a inclusão de `tests/platform-search.test.ts`.

O teste da busca protege explicitamente:

- normalização de acentos;
- escopo exato do índice;
- não indexação de auditoria/migrações;
- roteamento de resultados;
- limite de resultados;
- busca por múltiplos termos.

## Logout — corrigido e preservado

`POST /auth/logout` continua:

- validando `Origin` oficial;
- expirando o cookie de sessão;
- retornando `303 See Other`;
- redirecionando para `OFFICIAL_ORIGIN`.

O comportamento foi validado externamente e confirmado manualmente pelo administrador.

## Funcionalidades disponíveis

- login institucional Entra/BFF;
- shell administrativo restrito a `ADMINISTRADOR`;
- navegação restaurável por hash;
- busca transversal permission-scoped;
- Visão geral;
- Sistemas;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- Publicações e Páginas ainda planejadas e sem escrita;
- estados loading, vazio, erro e permissão negada;
- reduced-motion e responsividade;
- logout com redirecionamento imediato.

## Regra operacional de validação contínua

Cada bloco de desenvolvimento deve terminar com:

1. higiene da mudança e remoção de artefatos temporários;
2. format, lint, typecheck, testes, build, actionlint e zizmor verdes;
3. atualização de `PROJECT_STATE.md` e `VERIFICATION.md` quando houver mudança material;
4. integração da candidata validável em `main` quando os gates permitirem;
5. deploy em `https://admin.escolaieda.com`, ainda protegido por `ADMINISTRADOR`;
6. manutenção explícita do `releaseState = validation` até autorização humana final.

## Próximos blocos

- continuar funções transversais previstas na especificação, priorizando o que não exige nova regra institucional;
- evoluir notificações/pendências, saúde/degradação e integração de módulos em fatias independentes;
- manter Publicações e Páginas sem escrita até seus contratos de produto estarem definidos;
- aplicar ReUI somente quando componente administrativo avançado trouxer ganho concreto;
- manter validação visual humana contínua no domínio.

## Bloqueios para produção oficial

- v0.3/v0.4 ainda não receberam aprovação visual humana final;
- módulos de produto ainda incompletos;
- Publicações e Páginas continuam planejadas;
- `APROVADO PARA PRODUÇÃO` não foi emitido.

## Regra de liberação

Deploy técnico e teste no domínio oficial não equivalem a liberação oficial. O comando humano exato `APROVADO PARA PRODUÇÃO` continua sendo requisito separado para disponibilização regular aos usuários.

## Links internos

- arquitetura: `ARCHITECTURE.md`;
- auditoria visual v0.2: `docs/AUDITORIA_VISUAL_CENTRO_ADMIN_V0.2.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- verificação: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
