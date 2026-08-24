# VERIFICATION — Centro de Administração v0.6

## Escopo

Validação da candidata v0.6 do Centro de Administração. O bloco transforma capabilities declaradas em autorização aplicada pelo BFF e torna o snapshot permission-aware, sem alterar a autenticação institucional, os grupos, a sessão ou a fronteira somente leitura.

Release state: `validation`. Nenhuma condição abaixo autoriza produção oficial.

## Baseline anterior

A v0.5 permanece publicada no domínio enquanto a v0.6 percorre o gate final.

Runtime v0.5:

`main@0e04f64e61619977d0f7579b0878cd8f400e727b`

Documentação v0.5 integrada até:

`main@effb6a02bf74a4532012c4f393695bd574b9c54d`

## Mudança de autorização v0.6

### Catálogo de capabilities

`shared/platform-contract.ts` passa a manter o catálogo tipado de capabilities do Centro.

A política server-side está em `server/auth/capabilities.ts`.

Na candidata atual:

- `ADMINISTRADOR` recebe explicitamente todas as capabilities do Centro;
- `PROFESSOR`, `ALUNO`, `APOIO` e `VISITANTE` recebem conjunto vazio.

Nenhum grupo Entra foi alterado.

### Autorização no ponto de execução

O BFF deixou de usar o papel `ADMINISTRADOR` como autorização final dos endpoints administrativos atuais.

Agora:

- `/api/platform/snapshot` exige `platform.snapshot.read`;
- `/api/sharepoint/health` exige `platform.health.read`;
- ausência da capability produz `403 Forbidden`.

Os papéis permanecem na sessão, mas são apenas entrada para a política de capabilities.

### Resolução por requisição

Capabilities não foram adicionadas ao cookie de sessão.

`/api/me` deriva e retorna as capabilities atuais a partir dos papéis já armazenados. Os endpoints protegidos repetem a resolução no servidor antes de autorizar a operação.

Isso evita usar o cliente ou uma capability antiga gravada no cookie como fonte de autorização.

## Snapshot recortado por capability

`getPlatformSnapshot` recebe as capabilities resolvidas e reduz tanto as leituras quanto a resposta:

- `platform.modules.read` libera módulos registrados;
- `platform.settings.read` libera configurações e migrações;
- `platform.audit.read` libera eventos de auditoria;
- `platform.health.read` libera o resumo operacional;
- módulos do núcleo são filtrados por suas capabilities declaradas.

Sem `platform.health.read`, `operational = null`.

Quando uma coleção não é autorizada, ela não é devolvida vazando dados internos: o teste serializa o snapshot e confirma ausência dos valores restritos usados como sentinela.

A busca continua permission-scoped porque seu índice é construído apenas a partir desse snapshot já recortado.

## Leituras Graph reduzidas

A composição evita consultas de listas específicas quando elas não são necessárias pelas capabilities da sessão:

- módulos: somente para `platform.modules.read` ou `platform.health.read`;
- auditoria: somente para `platform.audit.read` ou `platform.health.read`;
- configurações/migrações: somente para `platform.settings.read`.

Não foi criado endpoint paralelo ou segunda fonte de dados.

## Manifests e fail closed

O schema dos manifests aceita apenas capabilities do catálogo versionado.

`tests/capabilities.test.ts` verifica que toda capability declarada por um módulo está explicitamente presente nos grants do papel exigido pelo manifesto.

Objetivo: uma capability futura não deve entrar em produção por simples adição textual ao manifesto; a política precisa ser atualizada conscientemente e os testes precisam continuar verdes.

## Testes de autorização

A suíte v0.6 adiciona/expande verificações para:

- grants de `ADMINISTRADOR` iguais ao catálogo atual;
- nenhum grant do Centro para `PROFESSOR`, `ALUNO`, `APOIO` e `VISITANTE` nesta validação;
- deduplicação de grants;
- `requireCapability` fail closed;
- `/api/me` com capabilities de administrador;
- `/api/me` com conjunto vazio para professor;
- `/api/platform/snapshot` sem sessão = `401`;
- `/api/platform/snapshot` com professor = `403`;
- `/api/sharepoint/health` com professor = `403`;
- snapshot limitado sem dados de módulos, configurações, auditoria ou migração sem capabilities correspondentes.

## App Factory — semantic assurance v0.6

Novo critério obrigatório:

- `AC-012` — capabilities derivadas server-side, enforcement nos endpoints e recorte do snapshot.

O contrato também atualiza `INV-002` e adiciona `INV-010`: papéis institucionais não são a decisão final de autorização; o BFF deriva capabilities e exige a capability no ponto de execução.

Fingerprint validado no CI:

`0df8838d07696ab8239a8890a2d1a07f31b745c1bf4c67141bc9b3ec8e23f277`

## CI da candidata limpa

PR #19, workflow `32779168279`: **success**.

Job aplicação `97597142311`:

- `npm ci`: **pass**, 0 vulnerabilidades reportadas pelo npm audit executado no install;
- `format:check`: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 12 arquivos de teste: **pass**;
- **87 testes**: **pass**;
- build Vite: **pass**.

Job de segurança:

- actionlint: **pass**;
- zizmor pedantic: **pass**.

Bundle produzido no CI da candidata:

- CSS: `index-D3GHYVLl.css`;
- JS: `index-rmiV2Byp.js`.

## Higiene da mudança

O PR intermediário #18 continha um workflow temporário usado para formatação/verificação. Esse PR foi fechado sem merge.

Como a exclusão direta do workflow foi bloqueada pelo conector, a candidata foi reconstruída sobre a `main` em `feat/centro-admin-v0.6-capability-authorization-clean` usando somente os blobs formatados dos arquivos funcionais/semânticos.

A comparação da branch final com `main` confirma:

- 1 commit funcional inicialmente;
- 14 arquivos de runtime/teste/contrato antes desta documentação;
- nenhuma alteração em `.github/workflows`.

## Fundação preservada

A v0.6 não altera:

- Microsoft Entra ID;
- grupos institucionais;
- `rolesForGroups`;
- formato do cookie de sessão;
- segredo/algoritmo de selagem;
- fluxo OIDC;
- Graph ou permissões;
- SharePoint `CENTROADMIN`;
- Cloudflare Pages;
- rotação automática de identidade técnica;
- logout corrigido em `POST` + Origin + `303`;
- automação cargo → grupos;
- qualquer domínio de escrita.

## Privacidade

Os testes anteriores de minimização continuam ativos para impedir exposição de:

- `ValorJson`;
- `AtualizadoPorObjectId` desnecessário;
- `UsuarioObjectId`;
- `DetalhesJson`.

A v0.6 adiciona uma segunda camada: mesmo metadados não sensíveis de uma coleção administrativa são omitidos quando a sessão não possui a capability da coleção.

## Fronteira de escrita

A v0.6 permanece somente leitura.

Não foram adicionadas mutações em:

- Operação;
- Sistemas;
- Auditoria;
- Configurações;
- Publicações;
- Páginas.

## Gates ainda necessários para encerrar v0.6

Após esta atualização documental:

- CI definitivo do novo head documentado: **pendente**;
- merge do PR #19: **pendente**;
- deploy Cloudflare da `main`: **pendente**;
- smoke externo do bundle v0.6 + endpoints anônimos: **pendente**;
- validação autenticada/humana no domínio: **pending**;
- produção oficial: **bloqueada**.

## Gate humano

A mudança de v0.6 não altera a regra institucional de quem recebe acesso durante esta validação: somente o papel `ADMINISTRADOR` recebe capabilities do Centro. Portanto não foi necessária nova decisão de produto para implementar o mecanismo.

Qualquer expansão futura de grants para Professor, Aluno, Apoio, Visitante ou papéis adicionais será mudança de política institucional e deverá ser validada explicitamente antes de ser aplicada.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
