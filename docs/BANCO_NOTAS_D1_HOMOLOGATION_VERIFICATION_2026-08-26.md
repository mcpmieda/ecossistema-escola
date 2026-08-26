# Banco de Notas — homologação D1 remota — 2026-08-26

## Resultado

Homologação remota concluída com sucesso no banco exclusivamente reservado ao Banco de Notas:

- database: `banco-notas-homologation`;
- workflow: `Banco de Notas D1 homologation`;
- execução: `#12` / run `32973613431`;
- commit validado: `7f13d6b85c18296ae0fa005dadb4000ec63515e5`;
- Wrangler observado no runner: `4.125.0`;
- conclusão do job `Provision and validate Banco de Notas homologation D1`: `success`.

Nenhum token, secret ou identificador sensível é registrado neste documento.

## Correção aplicada ao provisionamento

O provisionamento deixou de depender da API Cloudflare montada manualmente para localizar/criar o database. O fluxo agora usa o contrato suportado pelo Wrangler atual:

1. `wrangler d1 list --json` para localizar por nome exato;
2. reutilização somente de `banco-notas-homologation` quando existe exatamente uma correspondência;
3. `wrangler d1 create banco-notas-homologation` sem `--json` quando ausente;
4. nova listagem para resolver e validar o UUID;
5. aplicação das migrations somente após conferir que o conjunto local é exatamente `0001` a `0006`.

O provisionador também normaliza as credenciais em memória, valida o formato do account id e recusa duplicidade do nome de homologação.

## Migrations remotas

A execução confirmou que `banco-notas-homologation` já continha o conjunto de migrations aplicável; o Wrangler respondeu `No migrations to apply!`.

A presença e os invariantes foram então comprovados pelos smokes remotos:

- smoke principal: migrations `0001` a `0005` reconhecidas no `d1_migrations` e schema esperado presente;
- smoke de perfis: migration `0006_banco_notas_import_analysis_profiles.sql` reconhecida e exercitada no D1 remoto real.

Portanto, a homologação possui `0001` a `0006` aplicadas e utilizáveis.

## Smoke principal — invariantes comprovados

`infra/banco-notas/cloudflare/smoke-homologation.ps1` concluiu com sucesso e comprovou remotamente, usando dados sintéticos:

- defaults seguros da fonte;
- authority padrão e `sync_enabled = 0`;
- rejeição de sobreposição de fonte authoritative;
- coexistência de `reference_only` sem assumir autoridade;
- rejeição de vínculo cross-year;
- rejeição de salto inválido de estado do import job;
- bloqueio de `analyzed` sem análise persistida;
- rejeição de provenance/hash incompatível;
- análise persistida habilitando transição para `analyzed`;
- `import_analyses` append-only para update e delete;
- bloqueio de reentrada de estado;
- `import_findings` e `import_finding_resolutions` append-only.

Run token sintético preservado pelo próprio smoke: `20260826132103-85826e11`.

## Smoke de perfis XLSX — invariantes comprovados

`infra/banco-notas/cloudflare/smoke-import-analysis-profiles-homologation.ps1` concluiu com sucesso sobre a migration `0006`, incluindo persistência e regras dos analysis profiles com dados sintéticos.

Run token sintético: `smoke-profile-20260826132107-92a30e9f`.

A execução não provisiona outro database, não faz deploy, não habilita sync e não toca produção.

## Segurança preservada

Durante a homologação:

- nenhum D1 de produção foi acessado ou alterado;
- nenhum Cloudflare Pages de produção foi alterado;
- `sync` permaneceu desabilitado;
- Entra, Graph e SharePoint não foram modificados;
- o workflow manteve `contents: read` e credenciais D1 dedicadas via GitHub Actions secrets;
- golden masters privados não participaram do provisionamento, migrations ou smoke;
- o PR #52 permaneceu aberto, draft e sem merge.

## Próximo bloco técnico

Com a homologação D1 fechada, a sequência segura passa a ser:

1. comprovar atomicidade do `D1GradeEventStore` usando binding D1 real/compatível, preservando `db.batch()` como unidade atômica;
2. ampliar o round-trip OOXML XLSX real entre analyzer e serializer;
3. preparar contratos/configuração Graph + SharePoint sem ativar integração externa;
4. preparar Entra/add-in sem liberar o add-in público antes de audience/scope reais;
5. deixar browser QA para um ambiente navegável e para uma etapa em que automação de navegador esteja autorizada.
