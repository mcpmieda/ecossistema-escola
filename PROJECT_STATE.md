# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Concluir o núcleo do Centro de Administração em blocos grandes e completos, preservando a fundação institucional existente e mantendo `releaseState = validation` até autorização humana explícita de produção.

Ao final de cada bloco, a candidata válida deve ser publicada em `https://admin.escolaieda.com`, ainda restrita ao público autorizado. Deploy de validação não equivale a liberação oficial.

## Estado corrente — v0.8

- candidata técnica atual: **v0.8 — recovery verificável**;
- runtime de recovery comprovado: `main@f369f05b0aa3a8fc4409295662907f04df886968`;
- workflow de prova: `CI and deploy` run `32791663369`;
- job de recovery pós-deploy: `97634653780` — **success**;
- evidência: artifact `9543382224` — `recovery-verification-32791663369`;
- artifact SHA-256: `84138929ff74a6779c4388d2aca506e42b936328d2b573614eee2f7509e11824`;
- recovery verificado em: `2026-08-25T00:00:45.362Z`;
- escopo provado: `sharepoint-snapshots-disposable-metadata-backup-restore-roundtrip`;
- checksum do backup: `c09b29ef863003f67c400efa5dd0dd5f88af7fc5a67392527c2e2004567bfe04`;
- checksum restaurado: `c09b29ef863003f67c400efa5dd0dd5f88af7fc5a67392527c2e2004567bfe04`;
- restoreMatched: **true**;
- cleanup: **deleted**;
- suíte: 14 arquivos / **104 testes**;
- semantic fingerprint v0.8: `3e4b132d5d2540347932cec4cd9a48f3016dbbf4ce1702dfd489cc1889563503`;
- autenticação: Microsoft Entra ID + BFF + cookie HttpOnly selado;
- fonte autoritativa administrativa: SharePoint `CENTROADMIN` via Graph;
- acesso Graph do backend: `Sites.Selected` com papel de site `write`;
- release state: `validation`;
- produção oficial: **não autorizada**.

## O que a v0.8 prova

A v0.8 comprova um round-trip real de recuperação sem usar dados operacionais e sem elevar privilégios do backend.

O teste usa a biblioteca técnica existente `SNAPSHOTS_PLATAFORMA` no `CENTROADMIN` e executa:

1. localização da biblioteca técnica;
2. criação de uma pasta descartável `RECOVERY_VERIFY_*`;
3. gravação de metadado sentinela;
4. leitura do valor como backup;
5. cálculo de checksum SHA-256;
6. sobrescrita destrutiva controlada;
7. confirmação da sobrescrita;
8. restauração do backup;
9. nova leitura e novo checksum;
10. comparação dos checksums;
11. exclusão obrigatória da pasta descartável.

A execução só retorna `verified` quando restore e cleanup terminam com sucesso.

## O que a v0.8 não prova

A evidência acima **não** significa disaster recovery completo. Ela não declara como testados:

- restauração integral de site SharePoint;
- recuperação de todas as listas institucionais;
- recuperação de dados operacionais reais;
- restauração do tenant Microsoft 365;
- continuidade total de todos os serviços externos.

A prova deve ser descrita exatamente pelo escopo registrado.

## Least privilege preservado

A primeira implementação tentou criar uma lista descartável e o Microsoft Graph respondeu `403` na execução `32790670588`.

A auditoria confirmou que o backend já possui deliberadamente `Sites.Selected` com papel `write` no `CENTROADMIN`. Em vez de ampliar o privilégio para permitir gerenciamento estrutural de listas, o self-test foi redesenhado para operar em `SNAPSHOTS_PLATAFORMA` com o acesso já existente.

Assim:

- não foi concedido novo privilégio Graph;
- nenhuma lista institucional é criada ou removida;
- nenhum item operacional é usado como sentinela;
- o recurso descartável é identificado por prefixo próprio;
- cleanup é obrigatório;
- falhas permanecem fail closed.

## Orquestração do recovery

Uma segunda execução, `32791253942`, evidenciou uma condição de corrida: o recovery foi disparado pelo mesmo push antes de o novo código chegar ao domínio e atingiu a versão anterior.

A solução permanente evita polling e evita `workflow_run`:

- `CI and deploy` valida aplicação e workflows;
- `deploy-production` publica o SHA da `main` no Cloudflare Pages;
- `verify-recovery` depende diretamente de `deploy-production` com `needs`;
- o job usa o mesmo SHA implantado;
- `id-token: write` existe somente no job de recovery;
- o workflow separado `Verify recovery` permanece apenas para execução manual em `main`.

Esse desenho passou `actionlint` e `zizmor` em persona `pedantic`.

## App Factory — contrato v0.8

Artefatos versionados:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

O contrato exige que recovery só seja considerado verificado quando existir execução real com:

- autenticação de manutenção válida;
- recurso descartável limitado ao escopo técnico declarado;
- backup;
- alteração destrutiva controlada;
- restore;
- checksum correspondente;
- cleanup confirmado;
- evidência redigida sem dados pessoais, segredos ou conteúdo operacional.

Fingerprint atual:

`3e4b132d5d2540347932cec4cd9a48f3016dbbf4ce1702dfd489cc1889563503`

## Fundação preservada

A v0.8 não reconstrói nem substitui:

- Microsoft Entra ID;
- grupos institucionais;
- mapeamento cargo → grupos;
- BFF de autenticação e sessão;
- formato/segredo do cookie;
- Cloudflare Pages;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- rotação automática da identidade técnica;
- logout corrigido;
- CI/CD existente.

## Capacidades consolidadas até v0.8

- login institucional Entra/BFF;
- shell administrativo shadcn/ui;
- navegação restaurável;
- busca transversal permission-scoped;
- autorização server-side por capabilities;
- snapshot minimizado e permission-aware;
- Visão geral;
- Operação/saúde observável;
- Sistemas e contrato modular versionado;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- estados loading, vazio, erro e permissão negada;
- responsividade e reduced-motion;
- logout com redirecionamento imediato;
- recovery técnico pós-deploy com evidência real.

`Publicações`, `Páginas` e a integração funcional do primeiro sistema independente permanecem adiados por decisão de produto e não bloqueiam o fechamento desta fase.

## Regra de validação contínua

Cada bloco deve terminar com:

1. remoção de artefatos temporários;
2. format, lint, typecheck, semantic check, testes, build, actionlint e zizmor verdes;
3. documentação atualizada;
4. integração em `main`;
5. deploy em `https://admin.escolaieda.com` em `validation`;
6. recovery pós-deploy quando aplicável;
7. confirmação externa do domínio e proteção dos endpoints;
8. `releaseState = validation` até autorização humana final.

## Próximo fechamento da fase

Com recovery/restore agora comprovado dentro do escopo técnico declarado, os bloqueios restantes são:

- higiene/auditoria final do código e documentação;
- browser QA e regressão final da candidata;
- smoke externo final do domínio;
- consolidação do estado final da fase.

O sistema só deve declarar **“O Centro atingiu 100% do escopo desta fase e está pronto para sua decisão de aprovação.”** quando esses gates restantes também estiverem concluídos.

## Produção oficial

Mesmo após 100% desta fase, a liberação regular aos usuários continua bloqueada até o comando humano exato:

`APROVADO PARA PRODUÇÃO`

## Links internos

- arquitetura: `ARCHITECTURE.md`;
- contrato modular: `docs/CONTRATO_MODULOS.md`;
- verificação: `VERIFICATION.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
