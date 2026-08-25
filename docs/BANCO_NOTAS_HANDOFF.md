# Banco de Notas — Handoff

Data: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52`

Estado: **Fase 1 implementada e submetida a hardening pós-review; permanece draft, sem merge e sem produção.**

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
- ausência de lançamento não é zero.

## Fase 1 implementada

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
- justificativa obrigatória e before/after auditável em patches administrativos;
- proteção de Origin;
- testes de domínio, API, UI, módulo, golden masters, deep-link e SQL executável.

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
- deep-links do Banco possuem regressão estrutural dedicada.

Evidência de código antes da atualização documental: head `de19c4e5774f4f4eca5009e8fd9e93640226e524`, workflow `32908018584` / run `#449` — **success** para security, format, lint, typecheck, semantic check, testes e build.

## O que a evidência ainda NÃO prova

Não ampliar a interpretação dos testes atuais:

- SQLite real comprova execução e invariantes do SQL compatível, mas não substitui teste em D1 remoto;
- o teste de deep-link é estrutural e não substitui browser QA real;
- não existe D1 de homologação provisionado neste branch;
- o registro SharePoint ainda não foi aplicado ao tenant;
- não houve deploy de produção;
- add-in definitivo, grade-events transacional, conversor genérico e reconciliação Graph ainda pertencem ao próximo bloco.

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
4. migrar OpenAPI/AsyncAPI válidos do POC;
5. implementar pipeline de importação e contrato intermediário do modelo genérico;
6. implementar `grade-events` transacional/idempotente e snapshots;
7. adaptar add-in sem client secret e com audience/scope Entra apropriado;
8. implementar storage/share/reconcile via Graph no backend;
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
- não transformar golden master privado em template, fixture, seed, migration, fallback ou dependência de runtime.
