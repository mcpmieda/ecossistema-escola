# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Evoluir o Centro de Administração em blocos grandes e completos, preservando integralmente a fundação existente e mantendo `releaseState = validation` até autorização humana explícita de produção.

Ao final de cada bloco concluído, a candidata corrente deve ser publicada em `https://admin.escolaieda.com`, ainda restrita ao público autorizado, para inspeção contínua. Deploy de validação não equivale a liberação oficial.

## Estado corrente

- fase em validação técnica: `v0.6` — autorização por capabilities;
- candidata limpa: branch `feat/centro-admin-v0.6-capability-authorization-clean`, PR #19;
- baseline publicada: `main@0e04f64e61619977d0f7579b0878cd8f400e727b` — runtime v0.5 via PR #14;
- documentação v0.5 integrada em `main@effb6a02bf74a4532012c4f393695bd574b9c54d`;
- CI inicial da candidata v0.6: workflow `32779168279` — **success**;
- v0.5 smoke externo: workflow `32776751948`, job `97589445198` — **success**;
- v0.4: busca transversal + modularização via PR #12;
- v0.3: fundação visual shadcn/ui via PR #11;
- logout corrigido: `main@c87cbe8be7594a6d8e87f4d219d79de984c52599` via PR #8;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- nível do sistema: `production-system`;
- autenticação: Microsoft Entra ID + BFF + cookie HttpOnly selado;
- fonte autoritativa administrativa: SharePoint `CENTROADMIN` pela integração Graph existente;
- release state: `validation`;
- produção oficial: **não autorizada**.

## v0.5 — baseline publicada

A v0.5 permanece a versão atualmente publicada enquanto a v0.6 percorre os gates finais.

Ela inclui:

- área `Operação`;
- detecção de lista estrutural obrigatória ausente;
- `foundation.status = degraded` quando a estrutura está incompleta;
- sinais conservadores de falha recente;
- cobertura declarada de `HealthEndpoint` sem execução automática;
- recuperação/restore explicitamente `not-verified` sem evidência própria.

## v0.6 — autorização por capabilities

A v0.6 transforma capabilities de metadados declarativos em regra efetivamente aplicada pelo servidor.

### Política server-side

Foi criado um catálogo tipado de capabilities e uma política central de papéis para grants.

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

Os grupos e o mapeamento Entra → papéis não foram alterados. Papéis passam a ser entrada da política; a decisão final é a capability exigida no ponto de execução.

### Capabilities não ficam congeladas na sessão

O cookie continua armazenando apenas a sessão institucional e seus papéis já existentes. As capabilities são derivadas novamente no servidor em cada requisição protegida.

Consequência: mudança futura da política pode entrar em vigor sem exigir que a capability antiga permaneça gravada no cookie e sem transformar o cliente em fonte de autorização.

### Endpoints protegidos

- `/api/me` retorna as capabilities resolvidas para a sessão;
- `/api/platform/snapshot` exige `platform.snapshot.read`;
- `/api/sharepoint/health` exige `platform.health.read`.

Perfil autenticado sem a capability necessária recebe `403` no servidor.

### Snapshot permission-aware

O snapshot passa a ser recortado pelas capabilities resolvidas:

- módulos do núcleo só aparecem quando suas capabilities estão presentes;
- sistemas registrados exigem `platform.modules.read`;
- configurações e migrações exigem `platform.settings.read`;
- auditoria exige `platform.audit.read`;
- sinais operacionais exigem `platform.health.read` e ficam `null` sem esse grant.

As leituras Graph de listas específicas também são evitadas quando a capability não exige aqueles dados.

A busca permanece permission-scoped sem criar segunda política: ela continua indexando apenas o snapshot que o BFF já filtrou.

### Fail closed para evolução futura

`tests/capabilities.test.ts` verifica que todo requisito de capability declarado pelos manifests está coberto explicitamente pela política do papel exigido.

Isso impede que uma capability nova seja adicionada ao manifesto e se torne utilizável silenciosamente sem decisão explícita de autorização.

## App Factory — contrato v0.6

Os artefatos semânticos foram atualizados para a autorização por capability:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

Novo critério:

- `AC-012` — capabilities derivadas server-side, enforcement no endpoint e recorte do snapshot.

Fingerprint corrente:

`0df8838d07696ab8239a8890a2d1a07f31b745c1bf4c67141bc9b3ec8e23f277`

O `semantic:check` do workflow `32779168279` confirmou o fingerprint e a cobertura semântica.

## Verificação técnica v0.6

PR limpo #19, workflow `32779168279`:

- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 12 arquivos de teste / **87 testes**: **pass**;
- build Vite: **pass**;
- actionlint: **pass**;
- zizmor pedantic: **pass**.

Testes novos/expandidos cobrem:

- grants explícitos de `ADMINISTRADOR`;
- ausência de grants para os demais papéis durante a validação;
- negação `403` sem capability;
- capabilities retornadas por `/api/me`;
- snapshot recortado sem vazamento das coleções não autorizadas;
- cobertura dos manifests pela política de capabilities.

## Higiene da v0.6

Um workflow temporário foi usado apenas para formatar e executar `npm run verify` durante o desenvolvimento. Como a exclusão direta foi bloqueada pelo conector, a candidata final foi reconstruída sobre `main` em uma branch limpa, copiando somente os 14 arquivos funcionais/semânticos.

O PR #19 contém **zero alterações em `.github/workflows`**. O PR intermediário #18 foi fechado sem merge.

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

Depois da publicação e smoke da v0.6, continuar o núcleo transversal sem inventar regras institucionais ainda não definidas. A integração progressiva de módulos é prioridade natural; notificações/pendências só devem avançar quando houver fonte e regra institucional claras.

## Bloqueios para produção oficial

- v0.6 ainda não foi integrada/publicada neste ponto da documentação;
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
