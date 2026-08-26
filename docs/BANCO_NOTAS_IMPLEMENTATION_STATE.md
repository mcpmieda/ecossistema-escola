# Banco de Notas — Implementation State

Última atualização: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

Fase: **1 consolidada + grade-events interno + núcleo de importação/modelo genérico**

## Avanço de 25/08/2026 — importação e modelo genérico

- o bearer Entra fail closed ganhou cobertura para audience em array, `kid` desconhecido, issuer/tenant inválidos, `nbf` futuro, assinatura inválida e configuração ausente, preservando a distinção 401/403/503;
- o endpoint público do add-in continua deliberadamente desconectado porque audience/scope reais não existem no ambiente;
- o plano de transformação agora gera uma instância determinística e autovalidável do modelo genérico, sem nomes ou coordenadas da origem, sempre em homologação e com sync desligado;
- import jobs possuem contrato tipado, idempotência por chave/hash, proveniência, findings, API autenticada, transições sequenciais e auditoria;
- a migration `0003_banco_notas_import_job_state_machine.sql` aplica o gate de estados no storage e torna findings append-only;
- `api/banco-notas-models-v1.openapi.yaml` identifica import jobs como conectados e endpoints de teacher model/Graph como futuros e não roteados;
- a orquestração backend de modelo docente exige um único destinatário Entra/UPN, compartilhamento autenticado, verificação de tamanho/hash e share audit; o adapter Graph real não foi conectado sem credenciais e recurso homologado.

Head funcional: `87bf87b60a17c24b5338d88b34c37ba7b0e32f74`. Workflow `32917400697` / run `#528` — **success**: segurança de Actions, formatting, lint, typecheck, semantic check, **196/196 testes em 34 arquivos** e build. `Deploy production` e `Verify recovery after deploy` ficaram `skipped`. O warning histórico de chunk acima de 500 kB permanece sem falha associada.

## Entregue no PR #52

- contrato semântico global inclui explicitamente o primeiro módulo especializado;
- migration D1 inicial com anos, vínculos, fontes, importações, modelos, regras, eventos, snapshots, compartilhamentos, conciliação e auditoria;
- migration complementar `0002_banco_notas_cross_year_integrity.sql` bloqueia vínculos incompatíveis entre anos letivos;
- constraints para autoridade temporal, idempotência, sequence, ausência versus zero e streams append-only;
- repositório D1 e domínio de `SourceAuthority`, com override docente prevalecendo explicitamente sobre o padrão anual e sem merge silencioso;
- capabilities `grades.*`, concedidas explicitamente somente ao administrador nesta fase;
- manifesto `banco-de-notas` 0.1.0 e registro SharePoint idempotente;
- API `/api/banco-notas`, health e operações iniciais de ano/fonte/vigência;
- shell path-based `/banco-de-notas` com HeroUI e React Router;
- `Configurações > Fonte` funcional, incluindo padrão anual, override por professor e `SyncEnabled=false`;
- edição de ambiente, estado da migração, status da fonte e vigências existentes com justificativa obrigatória;
- auditoria de mutações administrativas com ator, motivo e estado anterior/posterior;
- edição de vigência com pré-carga das datas atuais e proteção contra limpeza acidental de `effectiveTo`; remoção deliberada exige `clearEffectiveTo=true`;
- período resultante inválido é rejeitado antes da escrita e mapeado como erro de entrada;
- contratos definitivos OpenAPI e AsyncAPI de grade-events migrados para `api/banco-notas-grade-events-v1.*`, sem hostname da POC, tenant hardcoded, client secret ou audience/scope inventados;
- contrato tipado de `GradeEvent`, `GradeSnapshot`, idempotência, stale e ausência diferente de zero;
- identidade do snapshot corrigida para `(gradeKey, field)` antes de qualquer D1 remoto ser provisionado;
- hash canônico do payload associado à chave de idempotência para detectar reutilização incompatível;
- núcleo de ingestão classifica `applied`, `duplicate` e `stale` sem regredir snapshot mais novo;
- store D1 valida fonte vinculada/ativa, ano e ambiente compatíveis, modelo conectado, `SyncEnabled`, autoridade vigente e mapeamento da célula antes de aceitar ingestão;
- persistência de evento e avanço de snapshot preparados no mesmo batch transacional, com reclassificação de stale no storage para reduzir risco de corrida;
- testes de domínio, migration, API, contrato, UI, autorização, Origin, deep-link estrutural, edição segura de vigência, grade-events, store D1 em SQLite real e isolamento dos golden masters.

## Hardening pós-review

A revisão independente da primeira implementação encontrou pontos que não seriam aceitos para merge. Eles foram tratados no mesmo PR:

1. **HeroUI nativo:** os controles HTML manuais de `Configurações > Fonte` foram substituídos por `TextField`, `Input`, `Select`, `ListBox` e `Switch` do HeroUI. O CSS específico que simulava controles do design system foi removido.
2. **Integridade por ano letivo:** a camada de persistência rejeita `source_assignments`, `teacher_assignments`, `relationship_snapshots` e `import_jobs` quando as entidades relacionadas pertencem a outro ano letivo.
3. **Auditoria de patches:** alteração de fonte ou vigência exige motivo; o repositório registra ator, motivo e before/after no evento de auditoria.
4. **Fonte editável:** ambiente, estado da migração e status deixaram de ser somente informativos e passaram a possuir fluxo de atualização.
5. **Sem reconciliação fictícia:** a interface não exibe uma data/resultado inventado antes da implementação real de reconciliação.
6. **SQL executável:** os testes deixaram de depender apenas de inspeção textual. Um processo Node separado executa as migrations em SQLite real e prova schema, defaults, conflitos de autoridade, integridade cross-year, idempotência, sequence, ausência versus zero, append-only e rollback transacional.
7. **Proteção de Origin:** mutações cross-origin são testadas como bloqueadas antes do acesso ao storage.
8. **Deep-link:** existe regressão estrutural específica para `/banco-de-notas` e `/banco-de-notas/configuracoes/fonte`, garantindo path routing sem hash e preservando o fallback SPA do Cloudflare Pages.
9. **Edição segura de vigência:** o campo final vazio significa “sem alteração”; limpar a data final exige ação explícita `clearEffectiveTo=true`, as datas existentes são pré-carregadas e o período final completo é validado antes da persistência.
10. **Grade-event concorrente:** snapshots passaram a ser identificados por `gradeKey + field`; eventos stale permanecem auditáveis sem impedir a existência do evento aplicado de mesma sequência.
11. **Store transacional testável:** a implementação D1 é exercitada por adaptador de SQLite real em suíte Node dedicada, incluindo evento aplicado, stale sem regressão, bloqueio de sync desabilitado e rejeição de célula não mapeada.

## Evidência de CI corrente

Head funcional consolidado antes desta atualização documental: `94ccceff31d6355b8ce6eaa396eba16e2ecd1932`.

Workflow `32911996770` — run `#495` — **success**:

- `Validate GitHub Actions security` — success;
- formatação — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **167/167 success em 28 arquivos**;
- build — success.

A suíte `tests/banco-notas-d1-grade-event-store.test.ts` executou **4/4** cenários com SQLite real e passou integralmente.

`Deploy production` e `Verify recovery after deploy` permaneceram `skipped`, como esperado para PR. O PR continua em `draft`; não houve merge nem alteração da produção.

A atualização documental feita depois desse head exige a própria CI verde antes de ser considerada a nova evidência final do branch.

## Limite da evidência atual

SQLite real comprova execução das migrations compatíveis e o comportamento do store sob o adaptador de teste, porém **não substitui homologação contra uma instância Cloudflare D1 remota**.

O teste de deep-link comprova a composição path-based e a configuração de fallback do repositório, mas **não é browser QA real**. Browser QA desktop/mobile, refresh e navegação direta continuam pendentes de ambiente de homologação.

O núcleo de grade-events está implementado e testado internamente, mas **o endpoint público para o add-in ainda não foi conectado**. A exposição permanece bloqueada até existir audience/scope Microsoft Entra apropriado e validação bearer própria para o consumidor independente; o cookie administrativo do Centro não será reutilizado como autenticação improvisada do add-in.

## Estado externo

O D1 de homologação não foi criado porque `npx wrangler whoami` confirmou ausência de sessão e não há `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` no processo. Não há ID fictício no repositório e não houve deploy. O script `infra/banco-notas/cloudflare/provision-homologation.ps1` foi auditado; ele cria/reutiliza somente `banco-notas-homologation`, gera configuração local ignorada e aplica as migrations, mas não foi executado por depender de login humano.

Os CLIs administrativos Microsoft (`az`/`m365`) e variáveis Entra/SharePoint do módulo não estão disponíveis no processo. Por isso, app registration, delegated scope, registro SharePoint e chamadas Graph reais não foram executados.

## Segurança e defaults

- navegador não acessa Graph/SharePoint diretamente;
- mutations administrativas exigem sessão, capability específica e Origin oficial;
- health degrada de forma explícita se o binding D1 não existir;
- sincronização nasce desligada;
- `effectiveTo` não é apagado silenciosamente;
- grade-event só é ingerido pelo núcleo quando fonte, modelo, autoridade, sync e mapeamento são coerentes;
- nenhum dado real ou arquivo docente está no Git;
- Ambient Constellation, shadcn e ReUI não fazem parte do módulo;
- Nina e Alanna continuam exclusivamente como golden masters privados externos.

## Pendências antes do piloto

- provisionar D1 de homologação e executar `0001` + `0002` no D1 real;
- aplicar o registro idempotente do módulo no SharePoint de homologação quando autorizado;
- executar browser QA real de desktop/mobile/deep-link/refresh;
- definir/provisionar audience e delegated scope Entra próprios para o add-in;
- conectar endpoint autenticado de `grade-events` ao roteamento público somente depois do gate Entra;
- adaptar o add-in Office.js para a API definitiva, sem client secret;
- conectar analisador/serializador XLSX cloud ao núcleo de jobs e ao gerador genérico já implementados;
- implementar o adapter Graph real para a orquestração de armazenamento, compartilhamento e reconciliação já testada;
- executar regressão privada externa com Nina/Alanna sem incorporar os arquivos ao produto;
- preparar piloto individual mantendo `SyncEnabled=false` até reconciliação.

## Próximo bloco funcional

Depois da homologação da fundação no D1 real, avançar em paralelo controlado para pipeline de importação/modelo genérico, autenticação Entra do add-in, exposição governada de `grade-events` e reconciliação Microsoft. A promoção deve continuar gradual, com `SyncEnabled=false` até validação individual.

## Regra crítica permanente

Os arquivos privados de homologação citados em `BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md` não são produto, template, seed, fixture pública ou dependência. A produção deve transformar qualquer planilha docente legada numa instância nova do modelo genérico, sem regras dependentes de pessoa, abas, turmas, disciplinas ou células específicas.
