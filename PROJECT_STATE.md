# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Construir uma nova candidata visual do Centro de Administração com as referências da App Factory, mantendo a correção funcional do logout já implantada e sem autorizar liberação oficial.

## Estado

- fase: `v0.2` integrada, em `validation`, com **gate visual reaberto** após o primeiro teste administrativo real;
- runtime atual: `main@c87cbe8be7594a6d8e87f4d219d79de984c52599` via PR #8;
- candidata funcional original: `main@6effd9e0ee8f8bbc0e5864398e3ce6e53777cbc0` via PR #4;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- nível do sistema: `production-system`;
- autenticação/autorização: Microsoft Entra ID + BFF + cookie HttpOnly selado; `ADMINISTRADOR` continua validado server-side;
- fonte autoritativa de dados administrativos: SharePoint `CENTROADMIN` pela integração Graph existente;
- release state: `validation`; **não é produção oficial**.

## Achados do primeiro teste administrativo

### 1. Interface v0.2 não aprovada visualmente

A interface não atingiu o nível de acabamento moderno esperado a partir das referências da App Factory.

A auditoria confirmou que:

- a App Factory prefere `shadcn/ui` como base para admin/dashboard/CRUD;
- `ReUI` é complemento seletivo para componentes administrativos avançados;
- `professional-default` exige hierarquia, spacing, tipografia, superfícies, estados completos e browser QA real;
- a v0.2 registrou `professional-default`, mas foi implementada com CSS/HTML nativos e sem Tailwind, shadcn/ui ou ReUI;
- houve organização, responsividade e estados, porém não uma lapidação visual autenticada/comparativa suficiente.

Estado da UI v0.2: **reprovada como candidata visual final**.

Documento: `docs/AUDITORIA_VISUAL_CENTRO_ADMIN_V0.2.md`.

### 2. Logout — corrigido e validado externamente

Problema observado:

- clicar em `Sair` apagava a sessão no servidor, mas a resposta `204 No Content` deixava o shell React anterior visível até uma recarga forçada.

Correção integrada pelo PR #8:

- preservado `POST /auth/logout`;
- preservada validação de `Origin` oficial;
- preservada expiração do mesmo cookie de sessão;
- resposta alterada para `303 See Other`;
- `Location` aponta para `OFFICIAL_ORIGIN`, fazendo o navegador reconstruir a raiz sem sessão.

### Evidência do hotfix

Execução do PR #8 `32764734020`: **success**.

Passaram novamente:

- format;
- lint;
- typecheck;
- testes;
- build;
- actionlint;
- zizmor.

Smoke externo descartável de logout: **success**.

No domínio oficial foi comprovado:

- `POST https://admin.escolaieda.com/auth/logout` com `Origin` oficial retorna `303`;
- `Location: https://admin.escolaieda.com`;
- `Set-Cookie` expira `__Host-ecossistema_session` com `Max-Age=0`.

O PR temporário #9 foi fechado sem merge e seu branch foi resetado para a `main`; o workflow descartável não faz parte do produto.

## Evidências anteriores preservadas

- CI da candidata original `32762212762`: **success**;
- smoke público/anônimo `32763013640`: **success**;
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
- reduced-motion e responsividade existentes;
- logout com redirecionamento imediato implantado.

## Trabalho atual

1. criar uma candidata visual separada do hotfix funcional;
2. usar a linguagem administrativa shadcn como referência principal;
3. usar ReUI somente onde houver ganho concreto em componente administrativo avançado;
4. aplicar o `professional-default` de forma verificável, não apenas declarativa;
5. executar browser QA real em desktop e mobile;
6. testar navegação, estados, foco, teclado, reduced-motion e logout no fluxo autenticado;
7. colher validação humana do administrador antes de declarar a interface visualmente lapidada.

## Bloqueios para produção oficial

- UI v0.2 não aprovada visualmente;
- nova candidata visual ainda não construída/aprovada;
- módulos de produto ainda incompletos;
- `APROVADO PARA PRODUÇÃO` não foi emitido.

## Regra de liberação

Deploy técnico e teste no domínio oficial não equivalem a liberação oficial. O comando humano exato `APROVADO PARA PRODUÇÃO` continua sendo requisito separado.

## Links internos

- arquitetura: `ARCHITECTURE.md`;
- auditoria visual: `docs/AUDITORIA_VISUAL_CENTRO_ADMIN_V0.2.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- verificação: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
