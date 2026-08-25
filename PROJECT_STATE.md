# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração atingiu **100% do escopo técnico definido para esta fase**.

- fonte técnica de verdade: `main`;
- implementação funcional consolidada: `main@03d6a9ca3107174af63d84a638301aebcdf6bfe4`;
- consolidação técnica/documental já publicada: `main@eeb2a6827edc5c09d38684e3165f38649a6ce81e`;
- domínio de validação: `https://admin.escolaieda.com`;
- acesso da candidata: restrito às capabilities administrativas existentes;
- release state: `validation`;
- produção oficial: **não autorizada**.

A inspeção autenticada do administrador e a decisão de aprovação são agora **gates humanos posteriores ao término do desenvolvimento desta fase**, e não trabalho técnico pendente.

## Escopo fechado desta fase

Por decisão de produto, estes itens permanecem adiados e não entram no cálculo de 100% desta fase:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

Notificações/pendências também não receberam implementação artificial: não existe nesta fase uma fonte autoritativa e uma regra institucional suficientes para criar comportamento real sem inventar regra de produto. A infraestrutura futura continua compatível com esse recurso, mas sua definição fica para o momento em que houver fonte e regra explícitas.

## Núcleo entregue

- Microsoft Entra ID + BFF + cookie HttpOnly selado;
- autorização server-side por capabilities;
- grants administrativos fail closed;
- shell administrativo shadcn/ui;
- navegação restaurável;
- busca transversal permission-scoped;
- snapshot server-side minimizado e recortado por capability;
- Visão geral;
- Operação/saúde e degradação observável;
- Sistemas com contrato modular versionado e resolução fail closed;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- estados loading, vazio, erro e permissão negada;
- responsividade, foco e reduced-motion;
- logout com redirecionamento imediato;
- recovery técnico pós-deploy com evidência real;
- CI/CD, segurança de workflows e semantic assurance ativos.

## Gates técnicos finais

### Pipeline da candidata funcional

`main@03d6a9ca3107174af63d84a638301aebcdf6bfe4`, workflow `32792263791`:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- deploy Cloudflare Pages: **success**;
- recovery pós-deploy: **success**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- 14 arquivos / **104 testes**: **pass**;
- build Vite: **pass**;
- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**.

Fingerprint semântico vigente:

`3e4b132d5d2540347932cec4cd9a48f3016dbbf4ce1702dfd489cc1889563503`

### Revalidação da consolidação final

A consolidação documental `main@eeb2a6827edc5c09d38684e3165f38649a6ce81e` também percorreu integralmente o pipeline:

- workflow `32793959939`: **success**;
- segurança: **success**;
- aplicação: **success**;
- deploy Cloudflare Pages: **success**;
- recovery pós-deploy: **success**;
- artifact de recovery: `9544190526`;
- artifact SHA-256: `682f84ac2ca6476b2ddf089ec5732557f31f95603df4491d84c2923187ed4f13`.

Portanto a documentação final não ficou um commit à frente de uma versão não validada.

## Recovery real

O self-test utiliza exclusivamente recurso descartável `RECOVERY_VERIFY_*` dentro da biblioteca técnica `SNAPSHOTS_PLATAFORMA`.

O round-trip executa:

1. criação do recurso técnico descartável;
2. gravação de sentinela;
3. leitura do backup;
4. checksum SHA-256;
5. sobrescrita destrutiva controlada;
6. restore;
7. nova leitura e checksum;
8. comparação do backup com o restaurado;
9. cleanup obrigatório.

A candidata funcional foi comprovada no run `32792263791`, job `97636412171`, com `restoreMatched = true` e `cleanup = deleted`.

A consolidação final foi novamente comprovada no run `32793959939`, job `97641635821`, também com conclusão **success** e artifact `9544190526`.

Esse gate prova somente `sharepoint-snapshots-disposable-metadata-backup-restore-roundtrip`. Ele não é apresentado como disaster recovery integral do Microsoft 365 ou do SharePoint.

## Least privilege preservado

- backend permanece em `Sites.Selected` com papel `write` no `CENTROADMIN`;
- nenhuma permissão Graph adicional foi concedida para o recovery;
- a tentativa inicial de criar lista nova recebeu `403`;
- o teste foi redesenhado para usar a área técnica já existente, em vez de ampliar privilégios.

## Smoke externo e browser QA

Harness descartável executado fora do pipeline de deploy:

- PR temporário #31: fechado **sem merge**;
- run `32793171050`;
- job `97638865311`: **success**;
- artifact `9543850730`;
- SHA-256 `19859a60f1f6e6c9005536979c3af7a3ef003ddb3c1474e54b0839d64e2d4fdf`.

Foram confirmados:

- documento raiz servido pelo domínio oficial;
- bundle atual do Centro servido;
- `/api/me` = `401` sem sessão;
- `/api/platform/snapshot` = `401` sem sessão;
- login institucional renderizado em Chrome desktop `1440×900`;
- login institucional renderizado em Chrome mobile `390×844`;
- `/#/sistemas` sem sessão continua bloqueado pelo login;
- link institucional continua apontando para `/auth/login`;
- capturas desktop/mobile sem cortes ou quebras visuais evidentes.

A inspeção autenticada das telas internas permanece deliberadamente humana porque não será criado bypass, cookie falso ou redução de segurança para automatizá-la.

## Higiene final

Na fonte ativa foram verificados:

- nenhum `TODO`, `FIXME`, `HACK` ou `TEMPORARY` residual;
- nenhum Playwright permanente deixado na aplicação;
- nenhum workflow temporário de `domain-smoke`, `cleanup`, `formatter` ou repair-loop na `main`;
- nenhum PR de desenvolvimento permanece aberto;
- PR histórico #3 encerrado sem merge por estar superado;
- PRs/harnesses descartáveis encerrados sem merge;
- branches históricas de desenvolvimento/teste/documentação sem código divergente da candidata válida.

## Fundação preservada

Não foram reconstruídos nem substituídos:

- Microsoft Entra ID;
- grupos institucionais;
- automação cargo → grupos;
- BFF e formato da sessão;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- Cloudflare Pages;
- CI/CD permanente;
- rotação automática da identidade técnica;
- certificados, secrets e protocolos existentes.

## Marco de 100%

**O Centro atingiu 100% do escopo técnico desta fase e está pronto para a inspeção e decisão de aprovação do responsável.**

Isso não significa publicação regular para os usuários. A candidata continua em `validation` e restrita ao público administrativo já autorizado.

A liberação oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`

Qualquer alteração material posterior a este marco invalida a aprovação da candidata anterior e exige nova validação.

## Referências internas

- arquitetura: `ARCHITECTURE.md`;
- contrato modular: `docs/CONTRATO_MODULOS.md`;
- verificação: `VERIFICATION.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
