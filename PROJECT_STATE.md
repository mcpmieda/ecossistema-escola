# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O núcleo do Centro de Administração chegou à candidata técnica final da fase **v0.8**, preservando a fundação institucional existente.

- fonte técnica de verdade: `main`;
- candidata publicada e submetida aos gates finais: `main@03d6a9ca3107174af63d84a638301aebcdf6bfe4`;
- domínio de validação: `https://admin.escolaieda.com`;
- acesso da candidata: restrito às capabilities administrativas existentes;
- release state: `validation`;
- produção oficial: **não autorizada**.

Deploy de validação no domínio oficial não equivale à liberação regular aos usuários.

## Escopo desta fase

Por decisão de produto, permanecem adiados e não bloqueiam o fechamento desta fase:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

O núcleo entregue inclui:

- Microsoft Entra ID + BFF + cookie HttpOnly selado;
- autorização server-side por capabilities;
- shell administrativo shadcn/ui;
- navegação restaurável;
- busca transversal permission-scoped;
- snapshot server-side minimizado;
- Visão geral;
- Operação/saúde observável;
- Sistemas com contrato modular versionado e resolução fail closed;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- estados loading, vazio, erro e permissão negada;
- responsividade e reduced-motion;
- logout com redirecionamento imediato;
- recovery técnico pós-deploy com evidência real.

## Gates técnicos finais

### CI, segurança e deploy

Execução final da `main@03d6a9ca3107174af63d84a638301aebcdf6bfe4`:

- workflow `CI and deploy`: run `32792263791`;
- aplicação: **success**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 14 arquivos / **104 testes**: **pass**;
- build Vite: **pass**;
- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**;
- deploy Cloudflare Pages: **success**;
- recovery pós-deploy: **success**.

Semantic fingerprint vigente:

`3e4b132d5d2540347932cec4cd9a48f3016dbbf4ce1702dfd489cc1889563503`

### Recovery real

A implementação usa a biblioteca técnica `SNAPSHOTS_PLATAFORMA` e não dados operacionais.

O round-trip executa recurso descartável `RECOVERY_VERIFY_*`, backup, sobrescrita destrutiva controlada, restore, comparação SHA-256 e cleanup obrigatório.

A primeira prova registrada permanece versionada no snapshot:

- run: `32791663369`;
- job: `97634653780`;
- artifact: `9543382224`;
- status: `verified`;
- restoreMatched: `true`;
- cleanup: `deleted`.

A candidata final foi novamente comprovada depois do deploy:

- run: `32792263791`;
- job: `97636412171`;
- verifiedAt: `2026-08-25T00:08:57.882Z`;
- backup checksum: `097386b0c0fee7dd65a07902979416ac4fb4e104018666a32afef34abd8692f3`;
- restored checksum: `097386b0c0fee7dd65a07902979416ac4fb4e104018666a32afef34abd8692f3`;
- restoreMatched: `true`;
- cleanup: `deleted`;
- artifact: `9543575179`.

Esse gate prova somente `sharepoint-snapshots-disposable-metadata-backup-restore-roundtrip`. Não deve ser descrito como disaster recovery integral do Microsoft 365 ou do SharePoint.

### Least privilege

A identidade do backend continua em `Sites.Selected` com papel `write` no `CENTROADMIN`.

Nenhuma permissão Graph adicional foi concedida para viabilizar o recovery. A tentativa inicial de criar lista nova recebeu `403`; o teste foi redesenhado para operar na área técnica existente em vez de ampliar privilégios.

## Smoke externo e browser QA anônimo

Harness descartável executado fora do pipeline de deploy:

- PR temporário: #31, fechado **sem merge**;
- run: `32793171050`;
- job: `97638865311` — **success**;
- artifact: `9543850730`;
- artifact SHA-256: `19859a60f1f6e6c9005536979c3af7a3ef003ddb3c1474e54b0839d64e2d4fdf`.

Verificações aprovadas:

- documento raiz servido pelo domínio oficial;
- bundle contém a experiência atual do Centro;
- `/api/me` retorna `401` sem sessão;
- `/api/platform/snapshot` retorna `401` sem sessão;
- Chrome real renderiza o login em desktop `1440×900`;
- Chrome real renderiza o login em mobile `390×844`;
- `/#/sistemas` sem sessão continua exibindo login, sem vazar o shell protegido;
- link de login continua apontando para `/auth/login`.

As capturas desktop e mobile foram inspecionadas e não apresentaram cortes ou quebras visuais evidentes.

O harness temporário foi removido da ponta ativa ao resetar seu branch para `main`.

## Higiene final

Auditoria final da fonte ativa:

- nenhum `TODO`, `FIXME`, `HACK` ou `TEMPORARY` encontrado;
- nenhum resíduo de Playwright na `main`;
- nenhum workflow temporário `domain-smoke`, `cleanup`, `formatter` ou repair-loop na `main`;
- PR histórico #3 da v0.1 encerrado sem merge por estar integralmente superado;
- nenhum PR permanece aberto;
- branches históricos identificados de `test/`, `feat/`, `fix/` e `docs/` foram convergidos para a `main@03d6a9ca3107174af63d84a638301aebcdf6bfe4` antes da documentação final.

A limpeza de refs não altera o histórico dos PRs já encerrados nem os commits já integrados em `main`.

## Fundação preservada

Esta fase não reconstruiu nem substituiu:

- Microsoft Entra ID;
- grupos institucionais;
- automação cargo → grupos;
- BFF/session cookie;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- Cloudflare Pages;
- CI/CD permanente;
- rotação automática da identidade técnica;
- certificados, secrets ou protocolos existentes.

## Gate humano restante

Todos os gates técnicos automatizáveis desta fase estão concluídos.

Ainda falta a inspeção humana autenticada da candidata no domínio, usando uma sessão real de `ADMINISTRADOR`, principalmente para avaliação subjetiva do shell e das telas internas. Esse gate não será substituído por credencial artificial, bypass de autenticação ou enfraquecimento da segurança.

Por isso, **a fase ainda não será declarada 100% concluída neste documento**. Após a inspeção autenticada satisfatória, o estado poderá ser fechado como pronto para decisão de produção.

Mesmo depois desse fechamento, a liberação regular continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`

## Regra de validação contínua

Cada parada de desenvolvimento deve deixar a candidata válida integrada e publicada em `https://admin.escolaieda.com`, ainda em `validation`, antes de encerrar o bloco.

## Referências internas

- arquitetura: `ARCHITECTURE.md`;
- contrato modular: `docs/CONTRATO_MODULOS.md`;
- verificação: `VERIFICATION.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
