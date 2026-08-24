# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Evoluir o Centro de Administração em blocos grandes e completos, preservando integralmente a fundação existente e mantendo `releaseState = validation` até autorização humana explícita de produção.

Ao final de cada bloco concluído, a candidata corrente deve ser publicada em `https://admin.escolaieda.com`, ainda restrita ao público autorizado, para inspeção contínua. Deploy de validação não equivale a liberação oficial.

## Estado corrente

- fase publicada: `v0.6` — autorização por capabilities;
- baseline runtime: `main@8632ae8eb420d2d2c2bd3c21ba33a53b8aea3d7a` via PR #19;
- CI final do PR #19: workflow `32779427463` — **success**;
- CI funcional anterior do mesmo PR: workflow `32779168279` — **success**;
- smoke externo v0.6: workflow `32781606033`, job `97604681958` — **success**;
- asset confirmado no domínio: `/assets/index-rmiV2Byp.js`;
- v0.5: operação e saúde observável via PR #14;
- v0.4: busca transversal + modularização via PR #12;
- v0.3: fundação visual shadcn/ui via PR #11;
- logout corrigido: `main@c87cbe8be7594a6d8e87f4d219d79de984c52599` via PR #8;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- nível do sistema: `production-system`;
- autenticação: Microsoft Entra ID + BFF + cookie HttpOnly selado;
- fonte autoritativa administrativa: SharePoint `CENTROADMIN` pela integração Graph existente;
- release state: `validation`;
- produção oficial: **não autorizada**.

## v0.6 — autorização por capabilities

A v0.6 transforma capabilities de metadados declarativos em regra efetivamente aplicada pelo servidor.

### Política server-side

O catálogo tipado de capabilities e a política central de papéis → grants ficam no código versionado.

Capabilities atuais:

- `platform.snapshot.read`;
- `platform.overview.read`;
- `platform.health.read`;
- `publications.read`;
- `pages.read`;
- `platform.modules.read`;
- `platform.audit.read`;
- `platform.settings.read`.

Na validação atual:

- `ADMINISTRADOR` recebe explicitamente todas as capabilities do Centro;
- `PROFESSOR`, `ALUNO`, `APOIO` e `VISITANTE` continuam sem grants do Centro.

Os grupos e o mapeamento Entra → papéis não foram alterados. Papéis são entrada da política; a autorização final é a capability exigida no ponto de execução.

### Resolução por requisição

Capabilities não são gravadas no cookie de sessão. O cookie continua armazenando apenas a sessão institucional e seus papéis existentes.

O servidor recalcula as capabilities em cada requisição protegida. Isso evita usar o cliente ou uma capability antiga persistida na sessão como fonte de autorização.

### Endpoints protegidos

- `/api/me` retorna as capabilities resolvidas para a sessão;
- `/api/platform/snapshot` exige `platform.snapshot.read`;
- `/api/sharepoint/health` exige `platform.health.read`;
- perfil autenticado sem a capability exigida recebe `403` server-side.

### Snapshot permission-aware

O snapshot é recortado pelas capabilities resolvidas:

- módulos do núcleo só aparecem quando suas capabilities estão presentes;
- sistemas registrados exigem `platform.modules.read`;
- configurações e migrações exigem `platform.settings.read`;
- auditoria exige `platform.audit.read`;
- sinais operacionais exigem `platform.health.read` e ficam `null` sem esse grant.

As leituras Graph de listas específicas também são evitadas quando a capability não exige aqueles dados.

A busca permanece permission-scoped sem segunda política: ela indexa somente o snapshot já filtrado pelo BFF.

### Fail closed para evolução futura

`tests/capabilities.test.ts` verifica que todo requisito de capability declarado pelos manifests está coberto explicitamente pela política do papel exigido.

Uma capability nova não deve se tornar utilizável apenas por ser adicionada ao manifesto; a política precisa ser atualizada conscientemente e o CI precisa continuar verde.

## App Factory — contrato v0.6

Artefatos semânticos:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

Critério adicionado:

- `AC-012` — capabilities derivadas server-side, enforcement no endpoint e recorte do snapshot.

Fingerprint corrente:

`0df8838d07696ab8239a8890a2d1a07f31b745c1bf4c67141bc9b3ec8e23f277`

O `semantic:check` passou nos workflows do PR #19.

## Verificação técnica v0.6

PR #19:

- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 12 arquivos de teste / **87 testes**: **pass**;
- build Vite: **pass**;
- actionlint: **pass**;
- zizmor pedantic: **pass**.

Cobertura nova/expandida:

- grants explícitos de `ADMINISTRADOR`;
- ausência de grants para os demais papéis durante a validação;
- negação `403` sem capability;
- capabilities retornadas por `/api/me`;
- snapshot recortado sem coleções não autorizadas;
- cobertura dos manifests pela política de capabilities.

## Deploy e smoke externo v0.6

A v0.6 foi integrada em `main@8632ae8eb420d2d2c2bd3c21ba33a53b8aea3d7a` e publicada no domínio de validação.

Smoke externo final:

- workflow `32781606033`;
- job `97604681958`;
- resultado: **success**;
- bundle contém `Centro v0.6 em validação controlada`;
- `/api/me` sem sessão = `401`;
- `/api/platform/snapshot` sem sessão = `401`;
- `/api/sharepoint/health` sem sessão = `401`;
- `/api/health` público = `200`;
- asset observado: `/assets/index-rmiV2Byp.js`.

### Falso negativo do primeiro smoke

A primeira versão do smoke procurava `platform.snapshot.read` e `platform.health.read` dentro do bundle do navegador. Essas strings pertencem à camada server-side e não são requisito do bundle cliente.

Esse teste gerou falso negativo após 36 tentativas. O smoke foi corrigido para validar somente evidências externamente observáveis: versão do bundle e comportamento HTTP dos endpoints.

Após a correção, o smoke passou imediatamente. Não houve alteração no runtime v0.6 para obter esse resultado.

PR temporário #20 foi fechado sem merge e a branch `test/domain-smoke-v0.6` foi resetada para `main`.

## Higiene da v0.6

O PR intermediário #18 continha um workflow temporário usado para formatação/verificação e foi fechado sem merge.

A candidata final foi reconstruída sobre `main` em uma branch limpa e o PR #19 entrou sem alterações permanentes em `.github/workflows`.

Artefatos temporários de smoke também não foram integrados.

## Fundação preservada

A v0.6 não altera:

- Microsoft Entra ID;
- grupos institucionais;
- mapeamento de grupos para papéis;
- estrutura do cookie de sessão;
- segredo/selagem de sessão;
- Graph ou suas permissões;
- SharePoint `CENTROADMIN` como fonte autoritativa;
- Cloudflare Pages;
- CI/CD permanente;
- secrets e rotação automática de identidade técnica;
- logout `POST` + validação de Origin + `303` + expiração do cookie;
- automação cargo → grupos;
- fronteira sem escrita da candidata.

## Funcionalidades disponíveis no domínio de validação

- login institucional;
- shell administrativo shadcn/ui;
- navegação restaurável por hash;
- busca transversal permission-scoped;
- autorização server-side por capabilities;
- Visão geral;
- Operação;
- Sistemas;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- Publicações e Páginas planejadas e sem escrita;
- estados loading, vazio, erro e permissão negada;
- responsividade e reduced-motion;
- logout com redirecionamento imediato.

## Regra de validação contínua

Cada bloco deve terminar com:

1. higiene e remoção/exclusão lógica de artefatos temporários;
2. format, lint, typecheck, semantic check, testes, build, actionlint e zizmor verdes;
3. documentação de estado atualizada;
4. integração em `main` quando os gates permitirem;
5. deploy em `https://admin.escolaieda.com` ainda em `validation`;
6. confirmação externa de que a candidata corrente está sendo servida e os endpoints anônimos continuam protegidos;
7. `releaseState = validation` até autorização humana final.

## Próximo trabalho após v0.6

Prioridade técnica natural: avançar a integração progressiva de módulos independentes ao Centro usando contratos explícitos, rotas isoladas, capabilities próprias, health/degradação e registro versionado, sem copiar regras internas dos módulos para o núcleo.

Notificações/pendências só devem avançar quando houver fonte e regra institucional claras.

Qualquer expansão futura de grants para Professor, Aluno, Apoio, Visitante ou papéis adicionais é mudança de política institucional e exige validação explícita antes de ser aplicada.

## Bloqueios para produção oficial

- validação visual humana final continua pendente;
- recuperação/restore ainda não possui evidência registrada de teste;
- módulos de produto ainda incompletos;
- Publicações e Páginas continuam planejadas;
- `APROVADO PARA PRODUÇÃO` não foi emitido.

## Regra de liberação

O comando humano exato `APROVADO PARA PRODUÇÃO` continua sendo requisito separado para disponibilização regular aos usuários. Merge, CI e deploy técnico não substituem essa autorização.

## Links internos

- arquitetura: `ARCHITECTURE.md`;
- auditoria visual v0.2: `docs/AUDITORIA_VISUAL_CENTRO_ADMIN_V0.2.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- verificação: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
