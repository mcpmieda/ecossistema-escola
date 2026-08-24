# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Corrigir os achados do primeiro teste autenticado do Centro de Administração e preparar uma nova candidata visual antes de qualquer liberação oficial.

## Estado

- fase: `v0.2` integrada, em `validation`, com **repair loop aberto** após teste administrativo real;
- runtime de referência antes deste repair loop: `main@7243d3647877334f7ccdeaedf0fc94ce339bffde`;
- candidata funcional original: `main@6effd9e0ee8f8bbc0e5864398e3ce6e53777cbc0` via PR #4;
- branch de correção atual: `fix/logout-visual-gate`;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- nível do sistema: `production-system`;
- fonte autoritativa dos dados: Microsoft Entra ID para identidade/autenticação, grupos institucionais para papel e SharePoint `CENTROADMIN` para dados administrativos do núcleo;
- autenticação/autorização: Entra ID + BFF + cookie HttpOnly selado; autorização administrativa validada server-side por `ADMINISTRADOR`;
- persistência: listas/bibliotecas SharePoint já provisionadas; nenhuma migration destrutiva nesta candidata;
- release state: `validation`; **não é produção oficial**.

## Achados do teste administrativo

### 1. Gate visual reaberto

A interface v0.2 não foi aceita como suficientemente moderna/lapidada em relação às referências da App Factory.

A auditoria confirmou que:

- a App Factory prefere `shadcn/ui` como base para admin/dashboard/CRUD;
- `ReUI` é complemento seletivo para componentes administrativos avançados;
- `professional-default` exige hierarquia, spacing, tipografia, superfícies, estados completos e browser QA real;
- a v0.2 registrou `professional-default`, mas foi implementada com CSS/HTML nativos e sem shadcn, Tailwind ou ReUI;
- houve melhoria de organização, responsividade e estados, porém não uma lapidação visual autenticada/comparativa suficiente para considerar o design aprovado.

Documento de referência do achado: `docs/AUDITORIA_VISUAL_CENTRO_ADMIN_V0.2.md`.

Estado da UI v0.2: **reprovada como candidata visual final**.

### 2. Logout com sessão apagada, mas shell antigo visível

Comportamento observado:

- clicar em `Sair` fazia a página piscar;
- o shell autenticado permanecia visível;
- a sessão só ficava perceptivelmente encerrada depois de recarga forçada do navegador.

Causa confirmada:

- o formulário fazia `POST /auth/logout`;
- o BFF limpava o cookie corretamente;
- a resposta era `204 No Content`, portanto não havia documento de destino nem redirecionamento para reconstruir a interface pública.

Correção no branch atual:

- manter POST, `Origin` oficial e limpeza do mesmo cookie;
- responder `303 See Other`;
- enviar `Location: OFFICIAL_ORIGIN`;
- fazer o navegador executar GET da raiz após o logout e reconstruir o estado sem sessão;
- teste de rota passa a exigir cookie expirado + `303` + `Location` oficial.

## Evidências anteriores preservadas

### CI da candidata original

Execução GitHub Actions `32762212762`: **success**.

Passaram:

- format;
- lint;
- typecheck;
- testes;
- build;
- actionlint;
- zizmor.

### Segurança

- proteção server-side de `/api/platform/snapshot` continua exigindo sessão + `ADMINISTRADOR`;
- `401` sem sessão e `403` para `PROFESSOR` permanecem testados;
- logout continua protegido por `Origin` oficial;
- `Referrer-Policy: same-origin` permanece necessário para o POST de formulário;
- nenhuma mudança foi feita em Entra, Graph, SharePoint, grupos, OIDC, rotação de certificados ou secrets.

### Smoke externo anterior

Execução GitHub Actions `32763013640`: **success** para raiz pública e proteção anônima dos endpoints.

Esse smoke não validou a experiência autenticada nem substitui browser QA visual.

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
- reduced-motion e responsividade existentes.

## Trabalho atual

1. validar por CI a correção do logout;
2. integrar a correção somente se todos os gates permanecerem verdes;
3. confirmar o novo logout no domínio oficial;
4. iniciar uma candidata visual posterior com referências explícitas da App Factory, usando linguagem shadcn como base e ReUI somente onde fizer sentido;
5. executar browser QA real desktop/mobile e colher aprovação humana antes de considerar o visual lapidado.

## Bloqueios para produção oficial

- UI v0.2 não aprovada visualmente;
- correção de logout ainda precisa completar CI/deploy/validação real;
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
