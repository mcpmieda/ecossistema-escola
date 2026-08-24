# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Concluir o núcleo do Centro de Administração em blocos grandes e completos, preservando integralmente a fundação existente e mantendo `releaseState = validation` até autorização humana explícita de produção.

Ao final de cada bloco concluído, a candidata corrente deve ser publicada em `https://admin.escolaieda.com`, ainda restrita ao público autorizado, para inspeção contínua. Deploy de validação não equivale a liberação oficial.

## Estado corrente

- baseline publicada e verificada: `v0.6`;
- runtime publicado: `main@8632ae8eb420d2d2c2bd3c21ba33a53b8aea3d7a` via PR #19;
- documentação v0.6 integrada até `main@d0c32d32844ec56037ddb46d7f93a386efc83aa5`;
- candidata técnica atual: `v0.7` — contrato de integração modular;
- branch final limpa: `feat/centro-admin-v0.7-module-integration-contract-clean`;
- PR final: #23;
- head funcional validado: `2d1089d6b256e836e76d083b7d581063df5d7834`;
- CI limpo v0.7: workflow `32785823534` — **success**;
- 13 arquivos de teste / **98 testes** — **pass**;
- semantic fingerprint v0.7: `7c0175727cc706f64575b885750cbe264c558f0f05fd883a111e8425595bcf73`;
- nível do sistema: `production-system`;
- autenticação: Microsoft Entra ID + BFF + cookie HttpOnly selado;
- fonte autoritativa administrativa: SharePoint `CENTROADMIN` pela integração Graph existente;
- release state: `validation`;
- produção oficial: **não autorizada**.

## Escopo de conclusão da fase atual

Decisão de produto registrada em 24/08/2026.

Os itens abaixo estão **explicitamente adiados** e não bloqueiam o marco de 100% desta fase:

- integração funcional do primeiro sistema independente;
- construção do módulo `Publicações`;
- construção do módulo `Páginas`.

Eles continuam previstos na arquitetura e serão retomados conforme estratégia de produto posterior.

O marco de **100% desta fase** só pode ser declarado quando todo o restante aplicável estiver concluído:

- contrato e infraestrutura de integração modular validados;
- autorização server-side por capabilities consolidada;
- núcleo administrativo, navegação, busca, estados e responsividade consolidados;
- operação, saúde e degradação observável consolidadas;
- notificações/pendências somente se houver fonte e regra institucional claras;
- recuperação/restore executado com evidência registrada;
- higiene final de código e documentação;
- regressões técnicas e segurança;
- browser QA e validação final da candidata;
- candidata final publicada e confirmada externamente no domínio.

Somente após esse marco o projeto deve informar: **“O Centro atingiu 100% do escopo desta fase e está pronto para sua decisão de aprovação.”**

## v0.7 — contrato de integração modular

A v0.7 estabelece a fronteira que permitirá incorporar sistemas independentes ao Centro sem duplicar autenticação, autorização, navegação ou infraestrutura compartilhada.

### Registro não significa integração

O SharePoint `PLATAFORMA_MODULOS` continua sendo inventário operacional.

A fonte de verdade do **contrato de integração** passa a ser o manifesto versionado em `server/modules/contracts.ts`.

Um item existir em `PLATAFORMA_MODULOS` não o torna automaticamente integrado ou disponível.

### Contrato versionado

O contrato exige:

- `contractVersion`;
- chave estável;
- nome;
- rota base same-origin;
- versão semântica;
- estado do contrato;
- ordem;
- `requiredCapabilities`;
- `healthEndpoint` sob `/api/`.

O contrato atual da `plataforma-base` usa `contractVersion = 1`.

### Resolução fail closed

`server/modules/registry.ts` compara registro operacional e contrato versionado e produz um estado explícito:

- `ready`;
- `registry-only`;
- `contract-mismatch`;
- `disabled`;
- `deprecated`;
- `invalid-registry`.

`available = true` somente quando:

1. o registro está instalado;
2. existe contrato versionado para a chave;
3. rota, versão e health endpoint correspondem ao contrato;
4. a sessão possui todas as capabilities exigidas.

### `RolesJson` removido do caminho ativo

`RolesJson` permanece apenas como campo legado da estrutura SharePoint existente nesta fase.

Ele:

- não é solicitado pelo BFF na leitura Graph de módulos;
- não integra o read model enviado ao navegador;
- não participa da busca;
- não concede autorização;
- não prova integração.

A autorização continua sendo feita exclusivamente pelas capabilities resolvidas server-side.

### Interface administrativa

A área `Sistemas` agora mostra o estado real da integração, versão do contrato e capabilities exigidas.

Não foi criado botão para abrir um sistema independente porque a primeira integração funcional foi adiada por decisão de produto.

## App Factory — contrato v0.7

Os artefatos semânticos foram atualizados:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

Novos elementos:

- `INV-011` — registro operacional não concede autorização nem equivale a integração;
- `AC-013` — integração só fica disponível com contrato versionado compatível e capabilities suficientes.

Fingerprint confirmado pelo CI:

`7c0175727cc706f64575b885750cbe264c558f0f05fd883a111e8425595bcf73`

## Verificação técnica v0.7

PR limpo #23, workflow `32785823534`:

- `npm ci`: **pass**, 0 vulnerabilidades reportadas;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 13 arquivos de teste / **98 testes**: **pass**;
- build Vite: **pass**;
- actionlint: **pass**;
- zizmor pedantic: **pass**.

Bundle gerado no CI:

- CSS: `index-Cy_yw-W_.css`;
- JS: `index-DDWNlGO3.js`.

## Higiene da v0.7

O PR intermediário #22 contém o histórico do repair loop e um workflow temporário de formatação/verificação. Ele foi fechado **sem merge**.

A candidata final foi reconstruída diretamente sobre `main@d0c32d32844ec56037ddb46d7f93a386efc83aa5`:

- 1 commit funcional;
- 15 arquivos definitivos;
- zero alterações em `.github/workflows`;
- nenhum formatter temporário na candidata final.

## Fundação preservada

A v0.7 não altera:

- Microsoft Entra ID;
- grupos institucionais;
- mapeamento de grupos para papéis;
- estrutura ou segredo do cookie de sessão;
- Graph ou suas permissões;
- SharePoint `CENTROADMIN` como fonte autoritativa;
- Cloudflare Pages;
- CI/CD permanente;
- secrets e rotação automática de identidade técnica;
- logout corrigido;
- automação cargo → grupos;
- fronteira somente leitura da candidata.

Nenhuma migração SharePoint foi executada para a v0.7.

## Capacidades já consolidadas no Centro

- login institucional Entra/BFF;
- shell administrativo shadcn/ui;
- navegação restaurável;
- busca transversal permission-scoped;
- autorização server-side por capabilities;
- snapshot server-side minimizado e permission-aware;
- Visão geral;
- Operação/saúde observável;
- Sistemas e contrato modular;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- estados loading, vazio, erro e permissão negada;
- responsividade e reduced-motion;
- logout com redirecionamento imediato.

`Publicações` e `Páginas` permanecem apenas como áreas planejadas por decisão de produto.

## Regra de validação contínua

Cada bloco deve terminar com:

1. consolidação e remoção de artefatos temporários;
2. format, lint, typecheck, semantic check, testes, build, actionlint e zizmor verdes;
3. documentação de estado atualizada;
4. integração em `main` quando os gates permitirem;
5. deploy em `https://admin.escolaieda.com` ainda em `validation`;
6. confirmação externa de versão e proteção dos endpoints;
7. `releaseState = validation` até autorização humana final.

## Próximo trabalho após v0.7

Após merge, deploy e smoke da v0.7, o próximo bloco prioritário é **recovery/restore e resiliência final do núcleo**.

A estratégia deverá distinguir:

- recuperação do código/deploy;
- recuperação da configuração/estrutura;
- recuperação dos dados autoritativos SharePoint.

Ausência de falha não pode ser apresentada como restore testado. `recoveryStatus` só poderá sair de `not-verified` mediante evidência executada e registrada.

Notificações/pendências não serão inventadas sem fonte e regra institucional definidas.

## Bloqueios para 100% desta fase

- merge/deploy/smoke externo da v0.7;
- recovery/restore com evidência executada;
- acabamento e auditoria final de higiene;
- browser QA e regressão final do escopo restante;
- publicação e verificação da candidata final no domínio.

Primeiro sistema integrado, Publicações e Páginas são **escopo adiado** e não entram nesses bloqueios.

## Produção oficial

Atingir 100% desta fase não equivale a liberação oficial.

O comando humano exato `APROVADO PARA PRODUÇÃO` continua sendo obrigatório para disponibilização regular aos usuários.

## Links internos

- arquitetura: `ARCHITECTURE.md`;
- contrato modular: `docs/CONTRATO_MODULOS.md`;
- auditoria visual v0.2: `docs/AUDITORIA_VISUAL_CENTRO_ADMIN_V0.2.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- verificação: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
