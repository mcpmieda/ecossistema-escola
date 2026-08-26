# Banco de Notas — Implementation State

Última atualização: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52`

Estado: **Fase 1 consolidada + grade-events interno + núcleo de importação/modelo genérico endurecido; PR draft, sem merge e sem produção.**

## Evidência funcional corrente

Head funcional: `82e977a27598fdffa77a7db7bfff17bf433827ce`.

GitHub Actions: workflow `32920316172` / run `#556` — **success**:

- `Validate GitHub Actions security` — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **206/206 em 35 arquivos**;
- build — success;
- `Deploy production` — skipped;
- `Verify recovery after deploy` — skipped.

O build mantém o warning histórico de chunk JavaScript acima de 500 kB, sem falha associada.

## Fundação entregue

- contrato semântico global aceita o Banco de Notas como primeiro módulo especializado;
- rota path-based `/banco-de-notas` e subrotas sem hash;
- API administrativa `/api/banco-notas/v1/*` e health `/api/banco-notas/health`;
- HeroUI React v3 nativo no módulo, sem shadcn, ReUI, facades ou Ambient Constellation;
- capabilities `grades.*` com autorização server-side;
- D1 como estado transacional estruturado;
- SharePoint/OneDrive reservados para arquivos e versões;
- Graph somente pelo backend;
- fontes `legacy_import` e `linked_teacher_model`, com default por ano e override docente;
- autoridade temporal explícita, motivo, operador e auditoria before/after;
- `SyncEnabled=false` por padrão;
- proteção cross-year no storage;
- edição segura de vigência, incluindo remoção explícita de `effectiveTo`;
- Origin oficial exigido nas mutações administrativas;
- golden masters privados isolados do produto.

## Migrations D1

O branch possui quatro migrations, ainda não aplicadas em D1 remoto:

1. `0001_banco_notas_foundation.sql` — schema base, fontes, modelos, mappings, eventos, snapshots, auditoria e importação;
2. `0002_banco_notas_cross_year_integrity.sql` — integridade cross-year;
3. `0003_banco_notas_import_job_state_machine.sql` — transições válidas e findings imutáveis;
4. `0004_banco_notas_import_finding_resolution.sql` — resolução auditável e append-only dos findings e proteção contra reentrada concorrente no mesmo estado.

As migrations são executadas em SQLite real por processos Node dedicados. Isso comprova compatibilidade/invariantes locais, mas **não substitui D1 remoto de homologação**.

## Import jobs e resolução de findings

O fluxo de importação possui:

- chave de idempotência;
- SHA-256 da origem;
- professor, ano letivo e fonte;
- proveniência;
- findings estruturados;
- operador e timestamps;
- state machine `draft → analyzed → generated → validated → ready_to_share → shared → connected`, com `failed` como terminal permitido;
- proteção contra salto de gates;
- proteção contra reentrada concorrente no mesmo estado;
- API autenticada por capability `grades.import.run`.

A análise pode registrar findings de severidade `error` e ainda alcançar `analyzed`, permitindo revisão humana. A progressão para `generated` e estados posteriores exige que todos os erros estejam resolvidos.

O finding original permanece append-only. A resolução não altera o registro histórico: é gravada separadamente em `import_finding_resolutions`, com `resolved_by`, `reason` e `resolved_at`, também append-only e com uma única resolução por finding.

O contrato de API expõe `id` e `resolvedAt` nos findings e aceita `resolvedFindingIds` numa transição auditada. Tentativa de resolver finding inexistente, de outro job ou já resolvido é conflito.

## Modelo genérico

O núcleo implementado separa:

```text
LegacyIntermediateModel
→ correspondências canônicas
→ TransformationPlan
→ GenericModelInstance
```

Garantias atuais:

- sem nomes específicos de professor, turma, disciplina, aba ou células dos golden masters;
- IDs canônicos determinam a identidade final;
- correspondência ausente ou ambígua gera blocker;
- `readyToGenerate=true` somente sem blockers;
- hash da origem e relationship snapshot permanecem na proveniência;
- instância gerada nasce em `homologation`;
- instância gerada nasce com `syncEnabled=false`;
- definição, layout e mapping são versionados;
- o layout define explicitamente `layoutVersion`, `firstStudentRow` e a coluna de cada `gradeField`;
- a posição escolar estável do aluno entra como `studentPosition` na correspondência canônica e no plano de transformação;
- o gerador calcula a linha por `firstStudentRow + studentPosition - 1`, sem ordenar UUIDs ou depender da ordem do workbook legado;
- a instância valida que cada célula corresponde exatamente à coluna e à linha determinadas pelo layout versionado;
- posições duplicadas dentro da mesma turma são bloqueadas antes da geração;
- saída é validável sem reabrir o workbook legado.

O layout físico deixou de ser convenção escondida no gerador. Alterar colunas ou a linha inicial exige nova definição/layout versionados; a ordem dos alunos é derivada da correspondência canônica, não de uma ordenação técnica arbitrária.

Limite atual: ainda não existe analisador/serializador XLSX cloud conectado ao pipeline. O bridge COM legado continua somente como ponte de migração/regressão, nunca como parser cloud definitivo. A implementação futura do serializador deve consumir o layout versionado existente, sem recriar uma segunda regra física paralela.

## Grade-events

Já implementado internamente:

- OpenAPI e AsyncAPI same-origin em `api/banco-notas-grade-events-v1.*`;
- contrato tipado de evento, receipt e snapshot;
- ausência distinta de nota zero;
- idempotência com hash canônico do payload;
- snapshot identificado por `(gradeKey, field)`;
- evento stale auditável sem regressão de snapshot;
- store D1 que valida fonte, ano, ambiente, modelo, sync, autoridade e mapping antes de aplicar evento;
- evento + avanço de snapshot preparados no mesmo batch transacional;
- testes em SQLite real.

O endpoint público do add-in permanece **deliberadamente desconectado**. Não usar cookie administrativo como atalho.

## Microsoft Entra do add-in

O backend possui validador bearer fail closed para access tokens Entra:

- RS256;
- JWKS;
- issuer;
- tenant;
- audience string/array;
- lifetime (`exp`/`nbf`);
- delegated scope;
- erros diferenciados entre autenticação, autorização e indisponibilidade/configuração.

`BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE` existem no runtime e também aparecem como placeholders vazios em `.env.example`.

Nenhum audience/scope real foi inventado ou provisionado. A conexão pública do add-in continua bloqueada até configuração Entra real.

## Orquestração Graph do modelo docente

A camada de orquestração continua abstrata, sem adapter Graph real, e aplica compensação explícita:

```text
store
→ share individual autenticado
→ metadata/hash verification
→ success audit
```

Se uma etapa falhar após upload/compartilhamento:

- a permissão criada é revogada quando aplicável;
- o arquivo armazenado é removido;
- o resultado da compensação é auditado;
- falha de compensação é promovida como erro explícito, não ocultada.

Isso evita declarar uma operação como simplesmente falha enquanto um compartilhamento rejeitado permanece silenciosamente ativo.

Ainda não houve chamada Graph real.

## OpenAPI de importação/modelos

`api/banco-notas-models-v1.openapi.yaml` está em versão `0.2.0`.

- import jobs estão marcados como `connected`;
- findings possuem identidade/resolução auditável;
- endpoints de teacher model/share/reconcile permanecem `future-not-routed`;
- não há alegação de storage/share/reconcile Graph ativo antes da homologação externa.

## Segurança e defaults preservados

- navegador não acessa Graph/SharePoint diretamente;
- mutações administrativas exigem sessão, capability e Origin oficial;
- add-in não usa client secret;
- `SyncEnabled=false` é o estado seguro inicial;
- nenhuma fonte é mesclada silenciosamente;
- ausência não equivale a zero;
- histórico de eventos, auditoria, findings e resoluções é append-only onde aplicável;
- nenhum arquivo docente real ou golden master entra no Git/runtime/D1/migrations/fixtures públicas;
- GitHub nunca é runtime.

## Golden masters

`NOTAS NINA 2026.xlsb`, `NOTAS ALANNA 2026.xlsb` e `Modelo_Professor_Nina_2026_Homologado.xlsx` permanecem exclusivamente como golden masters privados externos.

Eles não são template, seed, migration, fallback ou dependência de runtime. A regressão privada futura deve apenas verificar generalização; nunca pode induzir hardcoding.

## Bloqueios externos confirmados

- Wrangler não autenticado e sem token/account Cloudflare no ambiente de execução usado até aqui;
- `az`/`m365` e configuração administrativa Microsoft indisponíveis;
- audience/delegated scope Entra do add-in não provisionados;
- D1 de homologação não provisionado/aplicado;
- registro SharePoint do módulo não aplicado ao tenant nesta fase;
- adapter Graph real não conectado;
- sem preview de homologação navegável para browser QA real.

Consequentemente, **não foram alegados** D1 remoto, Entra provisionado, SharePoint aplicado, Graph real, browser QA real, sync end-to-end ou deploy do Banco de Notas.

## Próximo marco

Ordem recomendada:

1. autenticar Wrangler e provisionar **somente** `banco-notas-homologation`;
2. aplicar `0001` + `0002` + `0003` + `0004` no D1 remoto;
3. executar smoke remoto com dados sintéticos, incluindo rollback, cross-year, state machine e resolução de findings;
4. provisionar audience/delegated scope Entra próprios do add-in;
5. somente então conectar o router público bearer de `grade-events`;
6. conectar analisador/serializador XLSX cloud ao pipeline genérico, consumindo o layout versionado já definido;
7. conectar adapter Graph real e aplicar SharePoint de homologação;
8. testar store/share/reconcile e compensação em ambiente real;
9. executar browser QA desktop/mobile/deep-link/refresh;
10. executar regressão privada externa dos golden masters;
11. preparar piloto individual, mantendo sync desligado até reconciliação.

## Regra de liberação

O PR #52 deve permanecer draft. Não fazer merge, retirar o draft, habilitar sync ou fazer deploy de produção sem decisão humana explícita.
