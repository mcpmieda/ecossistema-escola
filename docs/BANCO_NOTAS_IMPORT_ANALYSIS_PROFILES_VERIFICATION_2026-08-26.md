# Banco de Notas — Perfis XLSX e análise verificada

Data: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52`

Estado: **implementação local consolidada; permanece draft, sem merge e sem produção.**

## Objetivo deste bloco

Fechar a lacuna entre uma fonte `legacy_import` genérica e o analyzer XLSX real sem codificar regras dependentes de professor, workbook privado, aba, turma, componente ou célula específica.

O fluxo passa a ser:

```text
data source legacy_import
→ perfil XLSX versionado e imutável
→ vínculo append-only a um import job draft XLSX
→ resolução do analyzer pelo perfil persistido
→ validação de bytes/hash/formato/ano
→ LegacyIntermediateModel
→ ImportAnalysis imutável
→ findings + auditoria + estado analyzed
```

## Migration 0006

`infra/banco-notas/d1/migrations/0006_banco_notas_import_analysis_profiles.sql` cria:

- `import_analysis_profiles`;
- `import_job_analysis_profiles`.

Invariantes de banco:

- perfil é somente `xlsx`;
- perfil pertence à mesma fonte e ano letivo;
- a fonte precisa ser `legacy_import`;
- perfil é append-only;
- um import job recebe no máximo um vínculo de perfil;
- vínculo exige job `draft`;
- job e perfil precisam ter o mesmo ano e a mesma data source;
- `provenance.sourceFormat` do job precisa ser `xlsx`;
- vínculo é append-only.

## Runtime administrativo

`functions/[[path]].ts` instancia no mesmo D1:

- `D1BancoNotasRepository`;
- `D1ImportAnalysisRepository`;
- `D1ImportAnalysisProfileRepository`.

O runtime não registra analyzer global por padrão. Para XLSX, `resolveImportAnalyzer` consulta o perfil anexado ao job e instancia `createGenericXlsxLegacyAnalyzer(profile)`.

Isso mantém a regra de leitura fora do código específico da escola e permite evoluir perfis por versão sem reescrever histórico.

## API

O ciclo de análise possui contrato separado em:

`api/banco-notas-import-analysis-v1.openapi.yaml`

Rotas administrativas conectadas:

- `GET/POST /v1/import-analysis-profiles`;
- `GET/POST /v1/import-jobs/{jobId}/analysis-profile`;
- `GET/POST /v1/import-jobs/{jobId}/analysis`.

O endpoint de análise exige `X-Import-Reason`, limita o upload a 32 MiB e usa a sessão administrativa same-origin. Este contrato não substitui o gate bearer Entra do add-in de eventos de notas.

## XLSB

Nenhum parser XLSB cloud é declarado.

O boundary aceita o MIME XLSB para permitir um adapter futuro, mas o runtime atual não registra analyzer XLSB e falha fechado com `import_analyzer_not_configured:xlsb`.

O bridge COM legado continua somente como ponte de migração/regressão externa.

## Smoke remoto seguro da migration 0006

Foi preparado:

`infra/banco-notas/cloudflare/smoke-import-analysis-profiles-homologation.ps1`

O script:

- exige `-ConfirmSyntheticWrites`;
- exige o binding `BANCO_NOTAS_DB`;
- recusa `database_name` diferente de `banco-notas-homologation`;
- exige que a migration `0006` já esteja aplicada antes da primeira escrita;
- verifica as duas novas tabelas;
- testa perfil XLSX válido;
- testa rejeição de perfil em `linked_teacher_model`;
- testa append-only do perfil;
- testa vínculo válido com job XLSX draft;
- testa append-only do vínculo;
- testa rejeição do mesmo perfil em job XLSB.

O script **não** cria D1, **não** aplica migrations, **não** faz deploy e **não** habilita sync.

A proteção estática correspondente está em:

`tests/banco-notas-import-analysis-profiles-homologation-smoke.test.ts`.

## Limite da evidência

Este bloco não executa recurso Cloudflare ou Microsoft externo.

Continuam pendentes:

- autenticação e execução real no D1 `banco-notas-homologation`;
- aplicação remota das migrations `0001`–`0006`;
- smoke remoto da migration `0006`;
- round trip real em Microsoft Excel;
- Graph/SharePoint de homologação;
- audience/delegated scope Entra do add-in;
- browser QA real;
- suporte XLSB cloud.

## Regras que permanecem bloqueadas

- não fazer merge sem decisão humana explícita;
- não retirar o PR do estado draft sem decisão humana explícita;
- não fazer deploy de produção;
- não habilitar sync antes de homologação e reconciliação individual;
- não promover arquivos privados Nina/Alanna a template, fixture pública, migration, runtime, D1 ou distribuição.
