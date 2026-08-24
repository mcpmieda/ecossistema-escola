# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Manter a candidata `v0.2` do Centro de Administração disponível para teste administrativo real no domínio oficial, sem convertê-la em liberação oficial.

## Estado

- fase: `v0.2` integrada e **PRONTA PARA TESTE ADMINISTRATIVO**;
- candidata de runtime integrada: `main@6effd9e0ee8f8bbc0e5864398e3ce6e53777cbc0` via PR #4;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- baseline da candidata anterior: `d2fe89b2315e5cc2def634aa91f871f8f4290c15` (`v0.1`);
- nível do sistema: `production-system`;
- fonte autoritativa dos dados: Microsoft Entra ID para identidade/autenticação, grupos institucionais para papel e SharePoint `CENTROADMIN` para dados administrativos do núcleo;
- autenticação/autorização: Entra ID + BFF + cookie HttpOnly selado; autorização administrativa validada server-side por `ADMINISTRADOR`;
- persistência/migrations: listas/bibliotecas SharePoint já provisionadas; nenhuma migration destrutiva foi necessária nesta candidata;
- recovery/backup: Git/Cloudflare para release e mecanismos existentes do SharePoint para dados;
- API/integração: `lightweight` para `/api/platform/snapshot`, consumidor único interno;
- contrato autoritativo da interface: `shared/platform-contract.ts` + comportamento do BFF;
- profundidade semântica: `domain`;
- semantic assurance: `specs/semantic-assurance.json`;
- Independent Verification: `independent`;
- release state: `validation`; **não é produção oficial**.

## Evidências concluídas

### CI da candidata

Execução GitHub Actions `32762212762`: **success**.

Passaram:

- format;
- lint;
- typecheck;
- testes;
- build;
- actionlint;
- zizmor.

### Segurança e regressão

- correção de logout/CSRF do PR #5 foi incorporada antes do merge da candidata;
- `tests/routes.test.ts` exige 401 para `/api/platform/snapshot` sem sessão;
- o mesmo teste exige 403 para sessão autenticada com papel `PROFESSOR`;
- snapshot permanece somente leitura e minimiza dados antes de devolvê-los ao navegador;
- Publicações e Páginas continuam sem operação de escrita nesta versão.

### Smoke externo do domínio oficial

Execução descartável GitHub Actions `32763013640`: **success**.

Verificado externamente em `https://admin.escolaieda.com`:

- raiz HTTPS acessível;
- HTML contém `<title>Ecossistema Escolar</title>`;
- `Referrer-Policy: same-origin` presente;
- `X-Content-Type-Options: nosniff` presente;
- `/api/me` sem sessão retorna `401 Unauthorized`;
- `/api/platform/snapshot` sem sessão retorna `401 Unauthorized`.

O smoke foi executado pelo PR temporário #6, que foi fechado sem merge. O branch de smoke foi resetado para a `main`, portanto o workflow descartável não faz parte da aplicação.

## Funcionalidades da candidata

- experiência institucional de login preservando o fluxo Entra/BFF existente;
- shell administrativo restrito a `ADMINISTRADOR`;
- navegação restaurável por hash;
- Visão geral integrada;
- catálogo Sistemas;
- Auditoria somente leitura;
- Configurações somente leitura sem expor valores protegidos;
- estados loading, vazio, erro e permissão negada;
- layout responsivo e `prefers-reduced-motion`;
- Publicações e Páginas sinalizadas como próximas fases, sem escrita.

## Limitações conhecidas

- Publicações e Páginas ainda não implementam seus fluxos de negócio;
- pesquisa global, notificações, pendências e preferências individuais ficam para fases posteriores;
- a QA visual e funcional **autenticada** requer uma conta institucional real com `ADMINISTRADOR` e passa a ser a etapa de teste do usuário;
- nenhuma senha, token ou cookie deve ser capturado como evidência durante esse teste.

## Trabalho atual

- bloco funcional: concluído para a candidata de teste `v0.2`;
- critério técnico de pronto para teste: atendido;
- próximo trabalho de produto: corrigir achados do teste administrativo ou iniciar a próxima fatia aprovada do Centro;
- o que não deve ser alterado: Cloudflare, Entra, Graph, `Sites.Selected`, SharePoint provisionado, grupos, sessão BFF, rotação automática e CI/CD existentes.

## Últimas decisões que afetam execução

- O Centro é parte nativa de `ecossistema-escola`.
- Deploy técnico para validação no domínio oficial não equivale a liberação oficial.
- `APROVADO PARA PRODUÇÃO` continua sendo o único comando humano que autoriza a futura liberação oficial.
- A candidata `v0.2` continua somente leitura nos novos domínios administrativos.
- O frontend usa um snapshot composto pelo BFF em vez de orquestrar chamadas diretas ao Graph/SharePoint.
- A UI segue `professional-default`; motion `ambient` fica concentrado na entrada e é atenuado para `subtle` no workspace.

## Bloqueios

- nenhum bloqueio técnico para o teste administrativo;
- liberação oficial permanece bloqueada por decisão humana e por etapas futuras de produto.

## Próxima ação

Abrir `https://admin.escolaieda.com` com uma conta institucional `ADMINISTRADOR` e executar a validação visual/funcional da candidata. Achados desse teste alimentam o próximo repair loop; não promover a candidata para usuários finais.

## Ambiente recomendado

- navegador real para o teste autenticado;
- GitHub CI para qualquer correção subsequente;
- nenhuma nova infraestrutura necessária.

## Links internos

- arquitetura: `ARCHITECTURE.md`;
- especificação externa: `Especificacao_Geral_Centro_de_Administracao_v2.0`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- verificação independente: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- relatório da fundação: `docs/RELATORIO_IMPLANTACAO_BASE_ECOSSISTEMA.md`.
