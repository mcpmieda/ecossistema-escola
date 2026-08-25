# VERIFICATION — Centro de Administração v0.9

## Resultado da fase

**100% do escopo técnico definido para esta fase foi concluído e revalidado após a migração HeroUI v0.9 e a calibração do Ambient Constellation.**

A candidata continua com `releaseState = validation`. Este fechamento técnico não autoriza produção oficial.

Itens explicitamente adiados e fora do cálculo desta fase:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

## Candidata e domínio

Candidata final:

`main@dd665205d0bbc37bcfbc6f423de02ec5e0e03527`

Domínio de validação:

`https://admin.escolaieda.com`

Design system validado:

- HeroUI React v3;
- `@heroui/react 3.2.4`;
- `@heroui/styles 3.2.4`;
- Ambient Surface Profile: `ambient-constellation`;
- Constellation Intensity: `strong` por densidade/profundidade, com partículas em microescala.

## Migração HeroUI

PR #35 implantou a migração visual transversal.

Commit inicial HeroUI em `main`:

`ff4dba8b22e3c4ef8f42d8968872ee0d98d3ba65`

Workflow `32826760272`:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- Deploy production: **success**;
- Verify recovery after deploy: **success**.

A migração não alterou BFF, Entra ID, sessão, capabilities, Graph, SharePoint, recovery ou contratos funcionais.

## Ambient Constellation — correção validada

A primeira implementação ampliava partículas junto com a viewport. A causa raiz foi eliminada no PR #36.

Implementação final:

- duas camadas de 28 micro-partículas;
- aproximadamente `0.6–1.3px` no desktop;
- redução adicional mobile;
- overscan aproximado `1.36× × 1.78×`;
- drift `12s` e `15s` em direções opostas;
- amplitude aproximada `20px` desktop e `12px` mobile;
- glow estático;
- `prefers-reduced-motion` com composição estática.

A App Factory foi atualizada separadamente pelo PR #54 para tornar essa calibração uma regra reutilizável e impedir recorrência do erro de escala.

## CI, segurança, deploy e recovery da candidata final

Workflow `32829296147` sobre `main@dd665205d0bbc37bcfbc6f423de02ec5e0e03527`:

- Validate GitHub Actions security: **success**;
- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**;
- Validate application: **success**;
- `npm ci`: **pass**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic contract: **pass**;
- testes: **pass**;
- build Vite: **pass**;
- Deploy production: **success**;
- Verify recovery after deploy: **success**.

Artifact de recovery:

- id: `9556184489`;
- nome: `recovery-verification-32829296147`;
- SHA-256: `d11dc3f9b82d1598251a942065458ff22b176a0b2e96a1c6129d9bb8a8cf10a7`;
- source commit: `dd665205d0bbc37bcfbc6f423de02ec5e0e03527`.

O recovery continua limitado ao round-trip descartável documentado da área técnica do SharePoint. Não declara restore integral do tenant Microsoft 365 ou de todos os serviços externos.

## QA visual real da build

Workflow temporário de browser QA: `32828658258` — **success**.

Artifact:

- id: `9555899769`;
- SHA-256: `1ed2260d306b141d903c707809f24d60b1e4031b14cc35923ec847f532afee66`.

Chrome real capturou e validou:

- login desktop `1440×900`;
- login mobile `390×844`;
- overview desktop com fixture administrativa isolada;
- overview mobile;
- overview desktop com `prefers-reduced-motion`.

O DOM renderizado confirmou:

- campo com as duas camadas esperadas;
- maior dimensão de partícula `≤ 1.3px` no desktop;
- nenhuma dependência de raio proporcional à viewport.

Inspeção visual das capturas:

- círculos grandes eliminados;
- partículas passam a ler como microestrelas/poeira luminosa;
- conteúdo continua dominante;
- áreas densas permanecem limpas;
- mobile não amplia partículas;
- reduced-motion preserva identidade visual sem drift.

O harness foi removido antes da integração em `main`.

## Smoke externo após deploy da candidata final

Harness descartável PR #37: fechado **sem merge**.

Run `32829585427`: **success**.

Artifact:

- id: `9556213823`;
- SHA-256: `61b3161328b95407a2a677a7d31ef34ff5ba748e5378d021d1b66f92efcca221`.

HTTP real confirmou:

- raiz do domínio disponível;
- candidata atual servida;
- `/api/me` = `401` sem sessão;
- `/api/platform/snapshot` = `401` sem sessão.

Chrome real no domínio confirmou:

- login institucional desktop `1440×900`;
- login institucional mobile `390×844`;
- CTA institucional aponta para `/auth/login`;
- `/#/sistemas` sem sessão permanece bloqueado pelo login;
- nenhuma regressão para círculos grandes na constelação servida pelo Cloudflare Pages.

## Autorização e fronteiras

A fase mantém:

- Entra ID como identidade institucional;
- grupos/roles apenas como entrada de identidade;
- capabilities como autorização efetiva do Centro;
- grants administrativos fail closed;
- recorte server-side do snapshot;
- endpoints administrativos negados anonimamente;
- módulos integrados disponíveis apenas com contrato compatível e capabilities suficientes;
- nenhuma sessão falsa ou bypass introduzidos para QA.

## Higiene final

- nenhum workflow temporário de browser QA foi incorporado à `main`;
- PR #37 foi encerrado sem merge;
- branches recentes de HeroUI/smoke foram realinhadas à candidata válida após uso;
- branch de correção da App Factory foi realinhada à `main` após o merge do PR #54;
- nenhuma alteração material ficou fora dos três arquivos da correção final antes do squash do PR #36;
- `main` permanece a única fonte técnica de verdade.

## Fundação preservada

Permanecem intactos:

- Microsoft Entra ID;
- BFF e sessão;
- grupos e roles institucionais;
- automação cargo → grupos;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- Cloudflare Pages;
- CI/CD permanente;
- rotação automática de identidade técnica;
- contratos modulares e semânticos;
- `releaseState = validation`.

## Gate humano e aprovação

Não existe mais trabalho de desenvolvimento obrigatório pendente dentro do escopo técnico desta fase.

O que permanece deliberadamente humano é a inspeção **autenticada** das telas internas usando uma sessão real de `ADMINISTRADOR`. Não será criado bypass, cookie falso ou redução de segurança para automatizá-la.

Após essa inspeção, a produção oficial permanece bloqueada até o comando exato:

`APROVADO PARA PRODUÇÃO`

Uma mudança material após este fechamento exige nova rodada de validação e torna qualquer aprovação anterior obsoleta.
