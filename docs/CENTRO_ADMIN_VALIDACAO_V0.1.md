# Centro de Administração — candidata de validação v0.1

Data: 2026-08-24

Estado: **VALIDAÇÃO CONTROLADA — NÃO LIBERADO OFICIALMENTE**

Comando necessário para futura liberação oficial: `APROVADO PARA PRODUÇÃO`.

## Objetivo desta candidata

Iniciar o Centro de Administração sobre a fundação já implantada do `ecossistema-escola`, sem reconstruir ou substituir Cloudflare, Entra ID, BFF, Microsoft Graph, SharePoint, grupos, sessão, CI/CD, rotação automática ou demais controles existentes.

A candidata implementa somente a primeira fatia funcional e visual do núcleo:

1. experiência própria de entrada do Centro;
2. preservação integral do endpoint `/auth/login` e do fluxo BFF/Entra existente;
3. shell administrativo inicial para `ADMINISTRADOR`;
4. bloqueio da candidata para perfis autenticados que não sejam administradores;
5. visão geral com leitura real do health check SharePoint já existente;
6. mapa inicial de módulos do Centro, sem ativar módulos ainda não construídos;
7. indicação explícita de que a versão está em validação controlada.

## Regras de acesso

- Usuário não autenticado: vê a tela de entrada e pode iniciar o login institucional pelo fluxo já existente.
- Usuário autenticado com `ADMINISTRADOR`: entra na candidata do Centro.
- Usuário autenticado sem `ADMINISTRADOR`: permanece fora da candidata e vê somente o aviso de validação restrita.
- Nenhum módulo planejado recebe operação de escrita nesta versão.

## Estrutura funcional inicial

### Visão geral

Estado: `em validação`.

Responsabilidades iniciais:

- resumo operacional;
- identidade administrativa;
- estado da persistência institucional por health check existente;
- indicação da condição de validação;
- ponto de entrada para futuras pendências, notificações e indicadores autorizados.

### Publicações

Estado: `planejado`.

Contrato pretendido: gestão de conteúdo institucional com revisão, programação, histórico e rollback, sem ser implementado nesta candidata.

### Páginas

Estado: `planejado`.

Contrato pretendido: edição controlada e versionada de páginas institucionais, sem implementação nesta candidata.

### Sistemas

Estado: `planejado`.

Contrato pretendido: catálogo administrável de módulos internos e portais externos, com capacidades e rotas declaradas.

### Auditoria

Estado: `planejado`.

Contrato pretendido: consulta autorizada da rastreabilidade administrativa e de eventos relevantes.

### Configurações

Estado: `planejado`.

Contrato pretendido: parâmetros globais, capacidades, integrações e rollout controlado.

## Garantias preservadas

A implementação desta candidata não altera:

- registros de aplicativos Entra;
- redirect URI;
- emissão ou validação de sessão;
- cookies HttpOnly;
- mapeamento grupo → papel;
- autorização server-side existente;
- permissões Graph;
- `Sites.Selected`;
- estrutura SharePoint;
- rotação automática de certificados;
- GitHub OIDC;
- Cloudflare Pages/Functions;
- DNS e domínio oficial.

A UI consome exclusivamente os contratos existentes `/api/me`, `/auth/login`, `/auth/logout` e `/api/sharepoint/health`.

## Arquivos alterados

- `src/App.tsx` — shell, gate visual por papel, experiência de login e visão geral.
- `src/styles.css` — identidade visual inicial, responsividade, foco e `prefers-reduced-motion`.

Commits da implementação inicial:

- `a83bbf1d0fc7012a815c70f21b329af6958b2dee` — estrutura funcional e gate da candidata.
- `286c65d7506481842d49f85da23610cbfda724af` — experiência visual e responsividade.

## Limites desta candidata

- Não é release oficial.
- Não ativa módulos de negócio.
- Não amplia permissões.
- Não cria novas fontes de verdade.
- Não escreve dados administrativos.
- Não substitui autenticação ou autorização existentes.
- Não interpreta CI verde como autorização de produção.

## Próxima fatia

Após validação técnica desta candidata, a construção deve continuar pelo núcleo funcional de plataforma: registro/manifesto de módulos, capacidades, navegação restaurável e visão geral baseada em contratos. A próxima implementação deve continuar restrita a validadores enquanto não existir o comando humano exato `APROVADO PARA PRODUÇÃO`.
