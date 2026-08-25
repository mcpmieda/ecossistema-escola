# VERIFICATION — Centro de Administração v0.8

## Escopo

Validação da v0.8 do Centro de Administração, com foco em recovery verificável, least privilege, orquestração pós-deploy e evidência técnica reproduzível.

Release state: `validation`. Nenhuma evidência deste documento autoriza produção oficial.

## Runtime verificado

SHA submetido à prova real:

`main@f369f05b0aa3a8fc4409295662907f04df886968`

Domínio de validação:

`https://admin.escolaieda.com`

Workflow:

- `CI and deploy` run `32791663369`;
- deploy job `97634486719`: **success**;
- recovery pós-deploy job `97634653780`: **success**.

A execução de recovery iniciou somente depois da conclusão bem-sucedida do deploy da mesma `main`.

## Evidência de recovery

Resultado emitido pelo runtime:

- status: `verified`;
- scope: `sharepoint-snapshots-disposable-metadata-backup-restore-roundtrip`;
- verifiedAt: `2026-08-25T00:00:45.362Z`;
- correlationId: `48625797-572c-484f-b456-fd7d197a2e5d`;
- backupChecksum: `c09b29ef863003f67c400efa5dd0dd5f88af7fc5a67392527c2e2004567bfe04`;
- restoredChecksum: `c09b29ef863003f67c400efa5dd0dd5f88af7fc5a67392527c2e2004567bfe04`;
- restoreMatched: `true`;
- cleanup: `deleted`;
- sourceCommit: `f369f05b0aa3a8fc4409295662907f04df886968`.

Artifact GitHub Actions:

- nome: `recovery-verification-32791663369`;
- artifact ID: `9543382224`;
- SHA-256 do artifact: `84138929ff74a6779c4388d2aca506e42b936328d2b573614eee2f7509e11824`;
- retenção configurada: 90 dias.

A evidência contém somente metadados técnicos redigidos. Não contém conteúdo institucional, credenciais ou dados pessoais.

## Procedimento realmente executado

O endpoint de manutenção autenticado por GitHub OIDC operou no `CENTROADMIN` usando a identidade Graph já existente e limitada por `Sites.Selected`/`write`.

O self-test:

1. localizou `SNAPSHOTS_PLATAFORMA`;
2. resolveu o drive da biblioteca;
3. criou somente uma pasta descartável `RECOVERY_VERIFY_*`;
4. gravou metadado sentinela;
5. leu o sentinela como backup;
6. calculou checksum SHA-256;
7. sobrescreveu o metadado com valor controladamente divergente;
8. confirmou a sobrescrita;
9. restaurou o backup;
10. releu o valor restaurado;
11. confirmou checksum idêntico;
12. removeu a pasta descartável;
13. somente então retornou `verified`.

## Least privilege

A primeira tentativa, run `32790670588`, chegou ao Graph mas recebeu `403` ao tentar criar uma nova lista SharePoint.

A fundação foi auditada e confirmou que a identidade backend possui deliberadamente papel `write` no site, não privilégio de gerenciamento estrutural mais amplo.

A correção adotada foi **reduzir a exigência do teste**, e não elevar a identidade:

- nenhuma nova permissão Graph foi concedida;
- nenhuma lista operacional foi criada ou removida;
- nenhum dado real foi usado como sentinela;
- `SNAPSHOTS_PLATAFORMA` foi reutilizada por ser a área técnica apropriada;
- o teste prova restore dentro desse escopo e nada além dele.

## Orquestração pós-deploy

Uma segunda execução, run `32791253942`, demonstrou que disparar o recovery no mesmo `push` permitia corrida com o deploy. O endpoint ainda servia a versão anterior quando foi chamado.

Uma tentativa de usar `workflow_run` foi rejeitada pelo `zizmor` com `dangerous-triggers`. A política não foi suprimida.

Arquitetura final:

- `validate` e `workflow-security` rodam primeiro;
- `deploy-production` depende dos dois;
- `verify-recovery` fica no mesmo `ci.yml` e depende de `deploy-production`;
- o job automático só existe para push em `main`;
- `id-token: write` é concedido apenas ao job de recovery;
- o checkout do recovery usa o mesmo `${{ github.sha }}` implantado;
- `.github/workflows/verify-recovery.yml` fica manual-only via `workflow_dispatch` para repetição controlada em `main`.

Esse desenho passou `actionlint` e `zizmor` persona `pedantic`.

## Testes e gates

Candidata least-privilege antes do merge:

- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 14 arquivos de teste: **pass**;
- **104 testes**: **pass**;
- build Vite: **pass**;
- actionlint: **pass**;
- zizmor pedantic: **pass**.

Os testes de recovery cobrem:

- round-trip bem-sucedido;
- ausência de tentativa de criar lista SharePoint;
- checksum divergente bloqueando `verified`;
- cleanup obrigatório mesmo após falha de restore;
- falha de cleanup bloqueando `verified`;
- identificador descartável inválido impedindo qualquer mutação Graph.

## Contrato semântico v0.8

Fingerprint vigente:

`3e4b132d5d2540347932cec4cd9a48f3016dbbf4ce1702dfd489cc1889563503`

O contrato registra explicitamente que a prova é um round-trip descartável de metadado na biblioteca técnica de snapshots e **não** equivale a disaster recovery completo.

## Limites da evidência

Não estão sendo declarados como testados:

- restore integral do SharePoint site;
- restore completo das listas institucionais;
- recuperação de dados operacionais reais;
- recuperação do tenant Microsoft 365;
- continuidade integral de serviços externos.

Esses limites são deliberados para impedir uma conclusão mais ampla que a evidência disponível.

## Fundação preservada

A v0.8 preserva:

- Microsoft Entra ID;
- BFF/session cookie;
- grupos e mapeamentos existentes;
- SharePoint `CENTROADMIN`;
- papel Graph `Sites.Selected`/`write` existente;
- Cloudflare Pages;
- rotação automática de identidade técnica;
- política cargo → grupos;
- autenticação e autorização por capabilities;
- contrato modular v0.7;
- `releaseState = validation`.

## Estado dos gates

- implementação recovery: **pass**;
- testes unitários/contrato: **pass**;
- segurança dos workflows: **pass**;
- deploy da versão provada: **pass**;
- round-trip SharePoint real: **pass**;
- checksum backup/restore: **pass**;
- cleanup: **pass**;
- evidência artifact: **pass**;
- registro versionado da evidência: em integração neste bloco;
- smoke externo final do domínio: pendente após integração do registro;
- browser QA final da fase: pendente;
- produção oficial: **bloqueada**.

## Próximo gate

Após integrar este registro de evidência em `main`, o pipeline deve publicar novamente o domínio e repetir automaticamente o recovery pós-deploy. Em seguida deve ser feito smoke externo da v0.8 e auditoria/browser QA final do escopo restante.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
