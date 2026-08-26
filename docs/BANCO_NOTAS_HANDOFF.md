# Banco de Notas — Handoff

Data: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52`

Estado: **Fase 1 consolidada, grade-events interno e núcleo de importação/modelo genérico; permanece draft, sem merge e sem produção.**

## Avanço mais recente

- bearer Entra coberto nos cenários fail-closed requeridos, sem conectar o router enquanto faltam audience/scope reais;
- geração determinística de `GenericModelInstance` a partir do plano pronto, independente do workbook original e sempre com `environment=homologation` e `syncEnabled=false`;
- import jobs persistentes/API com hash, idempotência, findings, proveniência, operador e state machine protegida também pela migration `0003`;
- OpenAPI de importação/modelos em `api/banco-notas-models-v1.openapi.yaml`, distinguindo endpoints conectados e futuros;
- orquestração backend de store/share/metadata/audit para modelo docente, sem adapter Graph real ou sucesso externo inventado;
- head funcional `87bf87b60a17c24b5338d88b34c37ba7b0e32f74`, workflow `32917400697` / run `#528` verde: **196 testes em 34 arquivos**, segurança, formatting, lint, typecheck, semantic check e build; deploy/recovery skipped.

Bloqueios confirmados no ambiente: Wrangler não autenticado e sem token/account Cloudflare; `az` e `m365` ausentes; variáveis Entra/SharePoint/add-in ausentes. Assim, D1 remoto, app registration/scope, SharePoint, Graph real e browser QA de homologação permanecem pendentes.

## Comece por aqui

1. Leia `AGENTS.md`.
2. Leia `.app-factory.json`.
3. Leia `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`.
4. Leia `docs/BANCO_NOTAS_ARCHITECTURE_V1.md`.
5. Leia `docs/BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md`.
6. Leia `specs/banco-notas/semantic-contract.json`.
7. Leia `specs/banco-notas/semantic-assurance.json`.
8. Leia `specs/banco-notas/verification-plan.json`.
9. Leia `docs/CONTRATO_MODULOS.md`, `ARCHITECTURE.md`, `VERIFICATION.md` e `PROJECT_STATE.md`.
10. Leia `api/banco-notas-grade-events-v1.openapi.yaml` e `api/banco-notas-grade-events-v1.asyncapi.yaml` antes de alterar eventos do add-in.

## Fontes de produto já auditadas

- `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado.docx` — funcionamento pedagógico/funcional.
- `Dossie_Tecnico_Modelo_Professor_Integracao_Banco_de_Notas_v1.0.docx` — integração vinculada, add-in, eventos, compartilhamento e reconciliação; prevalece sobre a hipótese antiga de importação isolada.
- `Plano_Mestre_antigo_antes_do_dossie.Reconstrucao_Planilha_Banco_de_Notas_v0.3.docx` — histórico técnico e regressão.
- `mcpmieda/escolaieda` no baseline `211251908efe078a8b75396e71e94827293da860` — POC/conversor/add-in/contratos a aproveitar seletivamente, nunca como local definitivo do produto.

## Golden masters privados

`NOTAS NINA 2026.xlsb`, `NOTAS ALANNA 2026.xlsb` e `Modelo_Professor_Nina_2026_Homologado.xlsx` são apenas golden masters privados externos.

Eles:

- não são templates oficiais;
- não entram no Git, D1, bundle, migrations, fixtures públicas, runtime, SharePoint definitivo ou distribuição;
- não podem induzir branches, regras, abas, turmas, componentes ou células específicas no produto;
- só podem ser usados posteriormente como regressão privada complementar.

O produto deve converter qualquer planilha docente legada para uma nova instância de um **modelo genérico limpo**, inicialmente com `SyncEnabled=false`.

## Decisões duráveis

- repositório definitivo: `mcpmieda/ecossistema-escola`;
- rota: `/banco-de-notas` e subrotas path-based;
- API: `/api/banco-notas/v1/*`;
- UI: HeroUI React v3 nativo em 100% do Banco;
- proibidos: shadcn, ReUI, facades e Ambient Constellation;
- D1: estado transacional estruturado, snapshots, configuração e auditoria;
- SharePoint/OneDrive: arquivos e versões;
- Graph: somente backend;
- Add-in Office.js: futuro emissor de baixa latência;
- GitHub: build/versionamento/manutenção, nunca runtime;
- fonte: `legacy_import` ou `linked_teacher_model`, com default por ano e override por professor;
- sem merge silencioso de fontes;
- `SyncEnabled=false` por padrão;
- ausência de lançamento não é zero;
- snapshot de nota é identificado por `gradeKey + field`, não somente por `gradeKey`;
- chave de idempotência reapresentada com payload diferente é conflito;
- evento stale permanece auditável e nunca regride snapshot mais novo;
- endpoint do add-in só pode ser exposto com bearer Entra/audience/scope próprios; não usar o cookie administrativo como atalho.

## Fase 1 consolidada

O PR #52 contém:

- specs globais atualizadas para aceitar o primeiro módulo especializado;
- capabilities `grades.*` e autorização server-side;
- manifesto `banco-de-notas` 0.1.0;
- registro SharePoint idempotente preparado;
- migrations D1 `0001` e `0002`;
- domínio/repositório/API de anos, fontes, vigências e autoridade efetiva;
- rota `/banco-de-notas` com React Router;
- shell e `Configurações > Fonte` em HeroUI;
- edição de ambiente, migração, status, autoridade, sync e vigência;
- pré-carga das datas da vigência e remoção explícita de `effectiveTo`;
- justificativa obrigatória e before/after auditável em patches administrativos;
- proteção de Origin;
- testes de domínio, API, UI, módulo, golden masters, deep-link e SQL executável.

## Núcleo de grade-events iniciado

Também já estão no mesmo PR:

- OpenAPI e AsyncAPI definitivos em `api/banco-notas-grade-events-v1.*`;
- contrato tipado de evento/receipt/snapshot;
- hash canônico de payload para idempotência;
- snapshots por `(gradeKey, field)`;
- retenção auditável de stale sem regressão do snapshot;
- store D1 que valida fonte ativa/vinculada, ano, ambiente, modelo conectado, sync, autoridade vigente e mapeamento da célula;
- persistência de evento + avanço de snapshot no mesmo batch;
- suíte Node/SQLite real para o store D1 e suíte unitária do núcleo de ingestão.

A ingestão pública do add-in permanece propositalmente desconectada até o gate Microsoft Entra.

## Hardening pós-review concluído

A revisão detectou e corrigiu no próprio PR:

- controles HTML manuais substituídos por HeroUI `TextField`, `Input`, `Select`, `ListBox` e `Switch`;
- CSS de simulação dos controles removido;
- integridade cross-year aplicada no storage para fontes, vínculos docentes, snapshots relacionais e import jobs;
- mutações de fonte/vigência exigem justificativa e registram before/after;
- ambiente/status/migração de fonte passaram a ser realmente editáveis;
- estado de reconciliação não é mais representado por texto fictício;
- migrations são executadas em SQLite real por processo Node isolado, em vez de somente procurar strings no SQL;
- Origin inválido é testado como bloqueado;
- deep-links do Banco possuem regressão estrutural dedicada;
- datas existentes são pré-carregadas ao editar vigência e a remoção da data final exige comando explícito;
- o teste de deep-link foi alinhado ao comportamento correto do `BrowserRouter basename`, sem forçar rota absoluta inválida.

Evidência funcional consolidada antes desta atualização documental: head `94ccceff31d6355b8ce6eaa396eba16e2ecd1932`, workflow `32911996770` / run `#495` — **success** para security, format, lint, typecheck, semantic check, **167/167 testes em 28 arquivos** e build. A suíte D1/SQLite do store passou 4/4.

A documentação adicionada após esse head precisa de sua própria CI verde antes de substituir essa evidência como head final do branch.

## O que a evidência ainda NÃO prova

Não ampliar a interpretação dos testes atuais:

- SQLite real comprova execução e invariantes compatíveis, mas não substitui teste em D1 remoto;
- o teste de deep-link é estrutural e não substitui browser QA real;
- não existe D1 de homologação provisionado neste branch;
- o registro SharePoint ainda não foi aplicado ao tenant;
- não houve deploy de produção;
- o endpoint público autenticado do add-in ainda não existe;
- audience/scope Entra do add-in ainda não foram provisionados;
- conversor/modelo genérico cloud, compartilhamento e reconciliação Graph continuam no próximo bloco.

## Provisionamento D1 de homologação

Quando houver autorização para o recurso externo e sessão Wrangler disponível:

```powershell
powershell -ExecutionPolicy Bypass -File infra/banco-notas/cloudflare/provision-homologation.ps1
```

O script prepara somente homologação, gera configuração local ignorada pelo Git e aplica as migrations. Não autoriza custo, produção ou promoção de dados reais.

## Próximo marco

Antes de piloto institucional:

1. provisionar D1 de homologação e executar `0001` + `0002` no D1 real;
2. testar health/API/Configurações > Fonte contra esse ambiente;
3. executar browser QA real desktop/mobile/deep-link/refresh;
4. definir e provisionar audience/delegated scope Entra próprios para o add-in;
5. conectar o endpoint público de grade-events com validação bearer somente depois do gate Entra;
6. conectar análise/serialização XLSX cloud ao pipeline e aos import jobs já implementados;
7. adaptar add-in sem client secret e com retry/idempotência conforme os contratos já migrados;
8. conectar um adapter Graph real à orquestração backend já implementada e homologá-lo;
9. executar regressão privada Nina/Alanna apenas como entrada externa;
10. só então preparar piloto individual com `SyncEnabled=false` até reconciliação.

## Regras para não regredir

- não reconstruir autenticação/BFF/Cloudflare/Entra/Graph/SharePoint existentes;
- não criar segundo design system;
- não reintroduzir Ambient;
- não colocar PII ou arquivos docentes reais no Git;
- não usar SharePoint como event store definitivo;
- não usar GitHub no runtime;
- não acumular wrappers, CSS de compatibilidade, funções duplicadas ou código morto;
- não ativar sync em massa;
- não apagar o caminho legado antes de provar equivalência;
- não transformar golden master privado em template, fixture, seed, migration, fallback ou dependência de runtime;
- não expor grade-events do add-in sem autenticação Entra independente adequada.
