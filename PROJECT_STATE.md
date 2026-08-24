# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Evoluir o Centro de Administração em blocos grandes e completos, com a candidata visual v0.3 baseada em shadcn/ui, preservando integralmente a fundação existente e sem autorizar liberação oficial.

Ao final de cada bloco de trabalho concluído, a candidata corrente deve ser publicada no domínio oficial de validação `https://admin.escolaieda.com`, mantendo acesso restrito a `ADMINISTRADOR`. Esse deploy serve para inspeção humana contínua e não equivale a liberação oficial.

## Estado

- fase: `v0.3` em validação visual/técnica;
- candidata v0.3: branch `feat/centro-admin-visual-v0.3`, PR #11;
- baseline integrada anterior: `main@d0d0695a84431d376494d1d016ce998462228b5f`;
- runtime funcional do logout: `main@c87cbe8be7594a6d8e87f4d219d79de984c52599` via PR #8;
- candidata funcional v0.2: `main@6effd9e0ee8f8bbc0e5864398e3ce6e53777cbc0` via PR #4;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- nível do sistema: `production-system`;
- autenticação/autorização: Microsoft Entra ID + BFF + cookie HttpOnly selado; `ADMINISTRADOR` continua validado server-side;
- fonte autoritativa de dados administrativos: SharePoint `CENTROADMIN` pela integração Graph existente;
- release state: `validation`; **não é produção oficial**.

## Candidata visual v0.3

A v0.3 substitui a camada visual v0.2 por uma base administrativa moderna usando shadcn/ui de forma real, e não apenas como referência estética.

Fundação visual incorporada:

- Tailwind CSS v4;
- shadcn/ui;
- Radix primitives;
- Lucide icons;
- Geist;
- tokens, spacing, bordas, radius e estados consistentes;
- componentes não utilizados removidos;
- ReUI não introduzido porque ainda não existe necessidade concreta de Data Grid, filtros avançados, calendário, Kanban ou outro componente administrativo complexo.

Principais áreas refeitas:

- login institucional;
- shell administrativo;
- sidebar e navegação ativa;
- topbar e identidade do usuário;
- dashboard/Visão geral;
- catálogo de Sistemas;
- Auditoria;
- Configurações;
- estados loading, vazio e erro;
- navegação mobile por drawer;
- foco visível, reduced-motion e responsividade.

A implementação preserva rotas, contratos, autorização, BFF, Entra, Graph, SharePoint, grupos e logout corrigido.

## Achados e correções durante a v0.3

### TypeScript 6

O bootstrap visual introduziu `baseUrl`, tratado como obsoleto pelo TypeScript 6. A opção foi removida em vez de silenciar a depreciação. O alias `@/*` permanece pelo mecanismo atual suportado.

### Vite 8

O build apontou uso futuro-incompatível de `__dirname` no `vite.config.ts`. O alias foi migrado para `import.meta.dirname`, eliminando o aviso sem supressão.

### QA visual automatizado

Foi montado um QA descartável em Chromium/Playwright para desktop, mobile, drawer, tabelas e login, incluindo detecção de overflow e erros de console.

O último ciclo parou por um falso positivo do harness: o `401` esperado de `/api/me` na tela anônima de login foi registrado pelo Chromium como erro de console. O comportamento da aplicação estava correto e o CI normal permaneceu verde. O workflow descartável foi removido do produto em vez de alterar a política de autenticação para satisfazer o teste.

A validação visual humana continua obrigatória antes de declarar a interface aprovada.

## Logout — corrigido e validado externamente

Problema original:

- clicar em `Sair` apagava a sessão no servidor, mas a resposta `204 No Content` deixava o shell React anterior visível até uma recarga forçada.

Correção integrada pelo PR #8:

- preservado `POST /auth/logout`;
- preservada validação de `Origin` oficial;
- preservada expiração do mesmo cookie de sessão;
- resposta alterada para `303 See Other`;
- `Location` aponta para `OFFICIAL_ORIGIN`, fazendo o navegador reconstruir a raiz sem sessão.

Evidência externa:

- `POST https://admin.escolaieda.com/auth/logout` com `Origin` oficial retorna `303`;
- `Location: https://admin.escolaieda.com`;
- `Set-Cookie` expira `__Host-ecossistema_session` com `Max-Age=0`.

## Evidências preservadas

- CI da candidata v0.2 `32762212762`: **success**;
- smoke público/anônimo `32763013640`: **success**;
- CI do hotfix de logout `32764734020`: **success**;
- CI da v0.3 antes do QA descartável: format, lint, typecheck, testes, build, actionlint e zizmor passaram;
- `/api/platform/snapshot` continua exigindo sessão + `ADMINISTRADOR`;
- `401` sem sessão e `403` para `PROFESSOR` permanecem testados;
- snapshot continua somente leitura e minimizado;
- nenhuma mudança foi feita em Entra, Graph, SharePoint, grupos, OIDC, secrets ou rotação automática.

## Funcionalidades preservadas

- login institucional Entra/BFF;
- shell administrativo restrito a `ADMINISTRADOR`;
- navegação restaurável por hash;
- Visão geral;
- Sistemas;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- Publicações e Páginas ainda planejadas e sem escrita;
- estados loading, vazio, erro e permissão negada;
- reduced-motion e responsividade;
- logout com redirecionamento imediato.

## Regra operacional de validação contínua

A partir da v0.3, cada bloco de desenvolvimento deve terminar com:

1. higiene da mudança e remoção de artefatos temporários;
2. format, lint, typecheck, testes, build, actionlint e zizmor verdes;
3. atualização de `PROJECT_STATE.md` e `VERIFICATION.md` quando o estado material mudar;
4. integração da candidata validável em `main` quando os gates técnicos permitirem;
5. deploy no domínio `https://admin.escolaieda.com`, ainda protegido por `ADMINISTRADOR`;
6. manutenção explícita do `releaseState = validation` até autorização humana final.

O objetivo é permitir que o administrador confira o sistema a qualquer momento entre blocos sem transformar o deploy em liberação oficial.

## Trabalho atual

1. fechar os gates normais da v0.3 após remoção do harness descartável;
2. integrar e publicar a v0.3 no domínio de validação;
3. continuar a evolução funcional do Centro em novos blocos completos;
4. aplicar ReUI apenas quando surgir necessidade real de componente administrativo avançado;
5. executar validação visual humana no domínio e registrar os achados;
6. manter cada novo bloco testável e publicado para inspeção.

## Bloqueios para produção oficial

- v0.3 ainda não recebeu aprovação visual humana;
- módulos de produto ainda incompletos;
- funcionalidades de Publicações e Páginas continuam planejadas;
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
