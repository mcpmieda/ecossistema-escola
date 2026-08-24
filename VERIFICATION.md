# VERIFICATION — Centro de Administração v0.3

## Escopo

Candidata de validação controlada do Centro de Administração após substituição da camada visual v0.2 por uma base administrativa moderna em shadcn/ui. Esta matriz separa gates técnicos, validação visual humana e liberação oficial.

Release state: `validation`. Nenhuma condição abaixo autoriza produção oficial.

## Estado atual

A v0.3 está implementada e tecnicamente validável, mas **ainda não recebeu aprovação visual humana**.

A candidata preserva:

- Microsoft Entra ID;
- BFF e cookie HttpOnly selado;
- autorização server-side por `ADMINISTRADOR`;
- Graph e SharePoint `CENTROADMIN`;
- grupos e automações existentes;
- rotas e contratos da plataforma;
- logout corrigido em `303 See Other`.

## Fundação visual v0.3

A v0.3 usa shadcn/ui como base real do shell administrativo, com:

- Tailwind CSS v4;
- shadcn/ui;
- Radix primitives;
- Lucide icons;
- Geist;
- tokens, spacing, bordas, radius e estados consistentes;
- login, sidebar, topbar, dashboard, tabelas, listas e drawer mobile refeitos;
- foco visível, reduced-motion e responsividade.

ReUI não foi introduzido porque as telas atuais não possuem necessidade concreta de Data Grid, filtros avançados, calendário, Kanban ou outro componente que justifique uma segunda biblioteca.

## Gates técnicos da v0.3

Antes do QA visual descartável, a candidata passou integralmente por:

- `npm run format:check`;
- `npm run lint`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`;
- actionlint;
- zizmor em modo pedantic.

A execução `32768088899` do CI normal também terminou em **success** para o head anterior à limpeza do harness visual.

O workflow visual temporário foi removido do produto. Um novo ciclo normal de CI é obrigatório no head final antes da integração.

## Achados técnicos corrigidos durante a v0.3

### TypeScript 6

O bootstrap visual adicionou `baseUrl`, já tratado como obsoleto pelo TypeScript 6. A opção foi removida, sem uso de `ignoreDeprecations`.

### Vite 8

O build apontou uso de `__dirname` incompatível com o futuro loader nativo do Vite. O alias foi migrado para `import.meta.dirname`, eliminando o aviso sem supressão.

## QA visual automatizado descartável

Foi montado um QA em Chromium/Playwright para:

1. Visão geral desktop;
2. Sistemas desktop;
3. Auditoria desktop;
4. Configurações desktop;
5. Visão geral mobile com reduced-motion;
6. drawer de navegação mobile;
7. login anônimo.

O harness também verificava overflow global e erros de console.

O último ciclo parou porque o Chromium registra como erro de console o `401 Unauthorized` esperado de `/api/me` na tela anônima de login. O próprio teste havia configurado esse `401` para validar o estado não autenticado. Portanto, o resultado foi classificado como **falso positivo do harness**, e não como regressão da aplicação.

A política de autenticação não foi alterada para satisfazer o teste. O workflow descartável foi removido do branch.

## Gate visual humano

A v0.3 somente pode ser chamada de visualmente aprovada quando houver inspeção humana no domínio de validação cobrindo, pelo menos:

- login;
- shell desktop;
- navegação e estado ativo;
- dashboard;
- Sistemas;
- Auditoria;
- Configurações;
- comportamento mobile;
- densidade, hierarquia, spacing e legibilidade;
- logout no fluxo autenticado.

Estado atual do gate visual humano: **pending**.

## Regra de validação contínua no domínio

Cada bloco de desenvolvimento concluído deve terminar com a candidata corrente publicada em `https://admin.escolaieda.com`, ainda restrita a `ADMINISTRADOR`, desde que os gates técnicos do bloco estejam verdes.

Esse deploy tem finalidade de inspeção e teste administrativo contínuo. Ele não muda o `releaseState`, não amplia público e não equivale a liberação oficial.

## Logout — correção preservada

`POST /auth/logout`:

1. mantém validação exata de `Origin`;
2. limpa o cookie de sessão;
3. retorna `303 See Other`;
4. envia `Location: OFFICIAL_ORIGIN`;
5. faz o navegador reconstruir a aplicação sem sessão.

PR #8, execução `32764734020`: **success**.

Smoke externo comprovou:

- `303`;
- `Location: https://admin.escolaieda.com`;
- cookie `__Host-ecossistema_session` expirado com `Max-Age=0`.

O comportamento também foi confirmado manualmente pelo administrador.

## Autorização preservada

- `/api/platform/snapshot` continua com `requireAuth` + `requireRole(..., 'ADMINISTRADOR')` no BFF;
- `401` sem sessão permanece comportamento esperado e testado;
- `403` para sessão sem `ADMINISTRADOR` permanece testado;
- UI nunca é tratada como barreira de segurança.

## Dados e privacidade preservados

`tests/platform-snapshot.test.ts` continua protegendo o read model contra exposição de:

- `ValorJson`;
- `AtualizadoPorObjectId` desnecessário;
- `UsuarioObjectId`;
- `DetalhesJson`.

## Critério atual

- logout: **pass**;
- autenticação/autorização: **pass**;
- dados minimizados: **pass**;
- fundação visual shadcn v0.3: **implementada**;
- CI normal do head final: **em fechamento**;
- QA visual automatizado descartável: **inconclusivo por falso positivo do estado 401 anônimo**;
- gate visual humano: **pending**;
- deploy de validação da v0.3 no domínio: **próximo passo após CI verde**;
- produção oficial: **bloqueada**.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
