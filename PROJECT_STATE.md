# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Entregar a primeira candidata funcional do Centro de Administração para teste real no domínio oficial, preservando integralmente a fundação já implantada e mantendo acesso restrito a administradores/testadores.

## Estado

- fase: construção e verificação da candidata `v0.2`;
- branch/commit de referência: `test/centro-admin-v0.2`;
- baseline seguro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- baseline da candidata anterior: `d2fe89b2315e5cc2def634aa91f871f8f4290c15` (`v0.1`);
- nível do sistema: `production-system`;
- fonte autoritativa dos dados: Microsoft Entra ID para identidade/autenticação, grupos institucionais para papel e SharePoint `CENTROADMIN` para dados administrativos do núcleo;
- autenticação/autorização: Entra ID + BFF + cookie HttpOnly selado; autorização administrativa validada server-side por `ADMINISTRADOR`;
- persistência/migrations: listas/bibliotecas SharePoint já provisionadas; `PLATAFORMA_MIGRACOES` registra migrations quando necessárias;
- recovery/backup: Git/Cloudflare para release; SharePoint versionado e procedimentos da fundação existente para dados; nenhuma migration destrutiva nesta candidata;
- API/integracao: `lightweight` para `/api/platform/snapshot`, consumidor único interno;
- contrato autoritativo da interface: `shared/platform-contract.ts` + comportamento do BFF;
- baseline/compatibilidade da API: candidata v0.2; sem consumidores externos;
- profundidade semântica: `domain`;
- semantic assurance: `specs/semantic-assurance.json` da candidata v0.2;
- formalizações semânticas: não aplicável nesta fatia somente leitura;
- Independent Verification: `independent`;
- checks independentes obrigatórios: CI existente (`format`, `lint`, `typecheck`, `Vitest`, `build`, `actionlint`, `zizmor`) + validação de acesso permitido/negado existente para papéis e inspeção do diff;
- checks independentes advisory/exceções: browser QA autenticado depende da sessão institucional real no domínio oficial; não usar DAST destrutivo em produção;
- funcionalidades validadas em código: login preservado, gate de administrador, manifesto do núcleo, navegação restaurável, snapshot BFF, Sistemas/Auditoria/Configurações somente leitura, estados loading/empty/error;
- limitações conhecidas: Publicações e Páginas permanecem planejadas e sem escrita; pesquisa global, notificações e preferências entram em fases posteriores do núcleo.

## Trabalho atual

- bloco funcional em andamento: concluir PR da candidata v0.2, corrigir qualquer gate de CI, integrar à `main`, validar deploy e disponibilizar para teste administrativo;
- critério de conclusão: CI verde, nenhuma regressão de autenticação/segurança, deploy no domínio oficial, tela pública de login verificada e shell administrativo pronto para o usuário testar com conta `ADMINISTRADOR`;
- impacto semântico conhecido: requisitos de acesso, navegação, composição de dados, minimização de dados e ausência de escrita da candidata;
- o que não deve ser alterado: Cloudflare, Entra, Graph, `Sites.Selected`, SharePoint provisionado, grupos, sessão BFF, rotação automática, CI/CD e fluxo Power Automate existente.

## Últimas decisões que afetam execução

- O Centro é parte nativa de `ecossistema-escola`, não um repositório/aplicação paralela.
- A candidata pode ser implantada em `admin.escolaieda.com` antes da aprovação oficial desde que permaneça restrita a validadores.
- `APROVADO PARA PRODUÇÃO` é o único comando humano que autoriza liberação oficial aos públicos definitivos.
- A v0.2 permanece somente leitura nos domínios administrativos novos; escrita de Publicações/Páginas exige fatia própria com estados, versionamento, concorrência e rollback.
- Navegação usa hash nesta fase para manter deep links sem alterar roteamento Cloudflare/BFF.
- O frontend recebe um snapshot composto pelo BFF em vez de orquestrar múltiplas chamadas ao Graph/SharePoint.
- A UI segue `professional-default`; motion `ambient` é restrito ao login e atenuado para `subtle` no workspace.

## Bloqueios

- nenhum bloqueio de produto para concluir a candidata de teste;
- a prova final do conteúdo autenticado no navegador requer uma conta institucional `ADMINISTRADOR`, portanto o usuário fará a validação visual autenticada quando a candidata estiver implantada.

## Próxima ação

Finalizar especificação/evidências, executar os gates no PR, corrigir o que falhar e integrar a candidata à `main` para deploy automático no domínio oficial.

## Ambiente recomendado

- GitHub CI para gates determinísticos e deploy;
- navegador real para QA final da experiência pública e sessão autenticada;
- nenhuma nova infraestrutura necessária.

## Links internos

- arquitetura: `ARCHITECTURE.md`;
- especificação de produto externa: `Especificacao_Geral_Centro_de_Administracao_v2.0` na biblioteca do usuário;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- verificação independente: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- relatório da fundação: `docs/RELATORIO_IMPLANTACAO_BASE_ECOSSISTEMA.md`.
