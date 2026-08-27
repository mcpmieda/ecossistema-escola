# Banco de Notas — homologação D1 remota — 2026-08-26/27

## Resultado atual

Homologação remota concluída com sucesso no database exclusivo:

- database: `banco-notas-homologation`;
- workflow: `Banco de Notas D1 homologation`;
- run mais recente: `33078530136` / execução `#19` — **success**;
- head validado: `a539417e09740db54c4f97ebbb62acc741bd0de2`;
- Wrangler: `4.125.0`;
- migrations `0001`–`0007` presentes e exercitadas;
- core smoke — success;
- analysis profiles smoke — success;
- estado final dos gates de identidade: `sync_enabled=0`.

Nenhum token, secret ou identificador sensível é registrado neste documento.

## Provisionamento

O provisionamento usa o Wrangler atual:

1. `wrangler d1 list --json` para localizar por nome exato;
2. reutiliza somente `banco-notas-homologation` quando há exatamente uma correspondência;
3. cria sem `d1 create --json` somente se o banco estiver ausente;
4. valida UUID/account;
5. confere o conjunto esperado de migrations antes de aplicar remotamente.

No run `33078530136`, o banco existente foi reutilizado e o Wrangler informou que não havia migrations pendentes.

O provisionador está travado nas migrations `0001`–`0007` e recusa conjunto divergente ou duplicidade do nome de homologação.

## Migrations remotas comprovadas

1. `0001_banco_notas_foundation.sql`;
2. `0002_banco_notas_cross_year_integrity.sql`;
3. `0003_banco_notas_import_job_state_machine.sql`;
4. `0004_banco_notas_import_finding_resolution.sql`;
5. `0005_banco_notas_import_analysis.sql`;
6. `0006_banco_notas_import_analysis_profiles.sql`;
7. `0007_banco_notas_teacher_entra_identity.sql`.

As migrations anteriores continuam válidas após a `0007`.

## Invariantes remotos comprovados

O smoke principal cobre com dados sintéticos:

- defaults seguros;
- autoridade padrão e sync desligado;
- rejeição de sobreposição authoritative;
- coexistência de `reference_only` sem tomar autoridade;
- integridade cross-year;
- state machine de import jobs;
- análise persistida obrigatória;
- provenance/hash;
- `import_analyses` append-only;
- bloqueio de reentrada de estado;
- findings/resoluções append-only.

O smoke de profiles comprova persistência e invariantes da migration `0006`.

## Migration 0007 — identidade Entra do professor

A `0007_banco_notas_teacher_entra_identity.sql` foi exercitada no D1 remoto.

O ciclo comprovou:

- modelo sem professor com Entra OID não pode entrar em sync;
- tentativa inválida não deixa sync ativado;
- Entra OID é único entre professores;
- após identidade sintética válida, o smoke pode habilitar sync temporariamente para provar locks;
- troca de OID é rejeitada durante sync;
- inativação do professor é rejeitada durante sync;
- o smoke retorna o modelo para sync desligado;
- a asserção final exige `sync_enabled=0`.

## Workflow permanente limpo

A preparação de uma conta real para o ensaio M365 foi usada somente de forma controlada e já foi removida do workflow padrão.

No commit `a539417e09740db54c4f97ebbb62acc741bd0de2` foram removidos de `.github/workflows/banco-notas-d1-homologation.yml`:

- UPN real;
- Object ID real;
- etapa automática de preparação do professor/modelo para share.

O workflow permanente voltou a executar somente:

- provisionamento/migrations;
- core smoke;
- analysis profiles smoke.

O script `infra/banco-notas/cloudflare/prepare-share-homologation.ps1` permanece protegido para uso manual consciente, exigindo parâmetros e confirmação explícita. Não recolocar identidade pessoal em YAML.

## Relação com a prova M365

O D1 de homologação foi usado para preparar registros sintéticos durante o ensaio de share. A prova Microsoft completa está documentada separadamente em:

`docs/BANCO_NOTAS_M365_SHARE_AND_EXCEL_HOMOLOGATION_2026-08-26.md`

Essa prova confirmou share individual, edição no Excel, download Graph, reanálise e cleanup, sempre com sync desligado.

A evidência D1 atual confirma que o workflow padrão não mantém o vínculo pessoal como rotina permanente.

## Segurança preservada

- nenhum D1 de produção foi acessado ou alterado;
- nenhum Cloudflare Pages de produção foi alterado;
- nenhum Worker temporário de produção foi criado;
- estado final de sync permaneceu desligado;
- credenciais D1 continuaram em GitHub Actions secrets;
- golden masters privados não participaram de migrations ou smokes;
- PR #52 permaneceu open, draft e sem merge;
- OID/UPN reais não permanecem no workflow.

O Banco continua baseado em **modelo genérico limpo** e mantém **golden masters privados externos** fora do produto.

## O que esta evidência prova — e o que não prova

Esta evidência prova o storage D1 remoto e seus invariantes.

Ela não substitui os gates específicos de:

- audience/scope Entra do add-in;
- bearer/ownership end-to-end do add-in;
- atomicidade por `D1Database.batch()` em binding Worker/Pages real;
- browser QA funcional amplo;
- release de produção.

Graph/SharePoint/Excel possuem evidência própria e já não são bloqueadores do ciclo de arquivos.

## Próximo bloco técnico

1. auditar apps Entra existentes;
2. homologar audience/delegated scope reais do add-in;
3. provar token e ownership sem publicar o add-in;
4. validar `D1Database.batch()` por binding quando existir runtime de homologação autorizado;
5. avançar módulos funcionais e QA.
