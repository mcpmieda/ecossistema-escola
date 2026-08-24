# VERIFICATION — Centro de Administração v0.6

## Escopo

Validação da v0.6 do Centro de Administração. O bloco transforma capabilities declaradas em autorização aplicada pelo BFF e torna o snapshot permission-aware, sem alterar a autenticação institucional, os grupos, a sessão ou a fronteira somente leitura.

Release state: `validation`. Nenhuma condição abaixo autoriza produção oficial.

## Baseline publicada

A v0.6 está integrada em:

`main@8632ae8eb420d2d2c2bd3c21ba33a53b8aea3d7a`

PR #19: **merged**.

O domínio de validação confirmado é:

`https://admin.escolaieda.com`

## Mudança de autorização v0.6

### Catálogo de capabilities

`shared/platform-contract.ts` mantém o catálogo tipado de capabilities do Centro.

A política server-side está em `server/auth/capabilities.ts`.

Na candidata atual:

- `ADMINISTRADOR` recebe explicitamente todas as capabilities do Centro;
- `PROFESSOR`, `ALUNO`, `APOIO` e `VISITANTE` recebem conjunto vazio.

Nenhum grupo Entra foi alterado.

### Autorização no ponto de execução

O BFF não usa mais o papel `ADMINISTRADOR` como autorização final dos endpoints administrativos atuais.

Agora:

- `/api/platform/snapshot` exige `platform.snapshot.read`;
- `/api/sharepoint/health` exige `platform.health.read`;
- ausência da capability produz `403 Forbidden`.

Os papéis permanecem na sessão, mas são entrada para a política de capabilities.

### Resolução por requisição

Capabilities não foram adicionadas ao cookie de sessão.

`/api/me` deriva e retorna as capabilities atuais a partir dos papéis já armazenados. Os endpoints protegidos repetem a resolução no servidor antes de autorizar a operação.

Isso evita usar o cliente ou uma capability antiga persistida no cookie como fonte de autorização.

## Snapshot recortado por capability

`getPlatformSnapshot` recebe as capabilities resolvidas e reduz tanto as leituras quanto a resposta:

- `platform.modules.read` libera módulos registrados;
- `platform.settings.read` libera configurações e migrações;
- `platform.audit.read` libera eventos de auditoria;
- `platform.health.read` libera o resumo operacional;
- módulos do núcleo são filtrados por suas capabilities declaradas.

Sem `platform.health.read`, `operational = null`.

Quando uma coleção não é autorizada, ela não é devolvida com dados internos. Os testes usam sentinelas e serialização do snapshot para verificar ausência dos valores restritos.

A busca continua permission-scoped porque seu índice é construído apenas a partir do snapshot já recortado.

## Leituras Graph reduzidas

A composição evita consultas de listas específicas quando elas não são necessárias pelas capabilities da sessão:

- módulos: somente para `platform.modules.read` ou `platform.health.read`;
- auditoria: somente para `platform.audit.read` ou `platform.health.read`;
- configurações/migrações: somente para `platform.settings.read`.

Não foi criado endpoint paralelo ou segunda fonte de dados.

## Manifests e fail closed

O schema dos manifests aceita apenas capabilities do catálogo versionado.

`tests/capabilities.test.ts` verifica que toda capability declarada por um módulo está explicitamente presente nos grants do papel exigido pelo manifesto.

Objetivo: uma capability futura não deve entrar em uso por simples adição textual ao manifesto; a política precisa ser atualizada conscientemente e os testes precisam continuar verdes.

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

Critério obrigatório adicionado:

- `AC-012` — capabilities derivadas server-side, enforcement nos endpoints e recorte do snapshot.

O contrato também atualiza `INV-002` e adiciona `INV-010`: papéis institucionais não são a decisão final de autorização; o BFF deriva capabilities e exige a capability no ponto de execução.

Fingerprint validado no CI:

`0df8838d07696ab8239a8890a2d1a07f31b745c1bf4c67141bc9b3ec8e23f277`

## CI da candidata limpa

PR #19, workflow funcional `32779168279`: **success**.

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

Após a documentação da candidata, o head final do PR #19 passou novamente no workflow `32779427463`: **success** para aplicação e segurança.

Bundle produzido/confirmado:

- CSS: `index-D3GHYVLl.css`;
- JS: `index-rmiV2Byp.js`.

## Merge e deploy

PR #19 foi integrado em `main` no commit:

`8632ae8eb420d2d2c2bd3c21ba33a53b8aea3d7a`

A regra permanente de CI executa deploy Cloudflare Pages após validação bem-sucedida de push em `main`.

## Smoke externo final

Workflow `32781606033`, job `97604681958`: **success**.

Em `2026-08-24T21:50:24Z`, um runner externo ao Cloudflare confirmou no domínio:

- bundle contém `Centro v0.6 em validação controlada`;
- `/api/me` sem sessão = `401`;
- `/api/platform/snapshot` sem sessão = `401`;
- `/api/sharepoint/health` sem sessão = `401`;
- `/api/health` público = `200`;
- asset observado: `/assets/index-rmiV2Byp.js`.

### Correção do smoke

A primeira versão do smoke exigia encontrar `platform.snapshot.read` e `platform.health.read` dentro do JavaScript cliente. Isso era uma premissa incorreta: as capabilities são enforcement server-side e suas strings não precisam integrar o bundle do navegador.

Essa primeira execução gerou falso negativo após 36 tentativas e não chegou a testar os endpoints.

O smoke foi corrigido para verificar apenas evidências externamente observáveis:

1. versão v0.6 no bundle;
2. `401` anônimo nos endpoints protegidos;
3. `200` no health público.

A execução corrigida passou imediatamente, sem alteração no runtime v0.6.

PR temporário #20 foi fechado sem merge e a branch `test/domain-smoke-v0.6` foi resetada para `main`.

## Higiene da mudança

O PR intermediário #18 continha um workflow temporário de formatação/verificação e foi fechado sem merge.

A candidata final foi reconstruída sobre `main` em `feat/centro-admin-v0.6-capability-authorization-clean` somente com os arquivos funcionais, testes e contratos necessários.

O PR #19 não adicionou workflow temporário permanente.

O smoke externo também foi executado em PR descartável e não foi integrado.

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

Os testes de minimização continuam impedindo exposição de:

- `ValorJson`;
- `AtualizadoPorObjectId` desnecessário;
- `UsuarioObjectId`;
- `DetalhesJson`.

A v0.6 adiciona outra camada: mesmo metadados não sensíveis de uma coleção administrativa são omitidos quando a sessão não possui a capability correspondente.

## Fronteira de escrita

A v0.6 permanece somente leitura.

Não foram adicionadas mutações em:

- Operação;
- Sistemas;
- Auditoria;
- Configurações;
- Publicações;
- Páginas.

## Estado do bloco v0.6

- higiene: **pass**;
- format/lint/typecheck/semantic/test/build: **pass**;
- 87 testes: **pass**;
- actionlint/zizmor: **pass**;
- merge em `main`: **pass**;
- deploy no domínio de validação: **pass confirmado externamente**;
- smoke externo específico da v0.6: **pass**;
- validação autenticada/humana final: **pending**;
- produção oficial: **bloqueada**.

## Gate humano

A v0.6 não altera a regra institucional de quem recebe acesso nesta validação: somente `ADMINISTRADOR` recebe capabilities do Centro.

Qualquer expansão futura de grants para Professor, Aluno, Apoio, Visitante ou papéis adicionais é mudança de política institucional e deve ser validada explicitamente antes de ser aplicada.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
