# Banco de Notas — Handoff

Data: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52`

Estado: **fundação consolidada, importação auditável, modelo genérico e geração XLSX real em código; permanece draft, sem merge e sem produção.**

## Evidência funcional

Head funcional verificado: `41172bc416d6a8bfcbc44871d48ae12fe05e724e`.

Workflow `32927767229` / run `#627` — **success**:

- segurança de GitHub Actions — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- **241/241 testes em 42 arquivos** — success;
- build — success;
- deploy production — skipped;
- recovery pós-deploy — skipped.

## O que entrou no último bloco

### 1. Serializador XLSX real

`server/banco-notas/xlsx-workbook-serializer.ts` implementa a geração física do `.xlsx` sem nova biblioteca de runtime.

Ele produz um pacote ZIP/OOXML determinístico com:

- `[Content_Types].xml`;
- relationships do pacote e workbook;
- propriedades do documento;
- `xl/workbook.xml`;
- styles;
- worksheets visíveis;
- worksheet `_BancoNotas` em `veryHidden`.

Os mesmos dados produzem os mesmos bytes e o mesmo SHA-256.

A aba interna registra proveniência e mapping físico: `modelId`, ano, versões, `sourceHash`, relationship snapshot, `sheetKey`, nome da aba, `cellAddress`, `gradeKey`, `field` e `studentPosition`.

O boundary `serializeGenericWorkbook` continua validando MIME, tamanho, hash e identidade do artefato.

### 2. Apresentação canônica

`shared/banco-notas-workbook-presentation.ts` separa dados canônicos de nomes visíveis.

`server/banco-notas/workbook-presentation.ts` monta a apresentação a partir do roster canônico e valida contra `GenericModelInstance`.

Nomes de abas são derivados deterministicamente de turma/componente, removem caracteres proibidos do Excel, respeitam 31 caracteres, evitam `_BancoNotas` e resolvem colisões com sufixos estáveis.

A apresentação falha fechado se modelo, ano, campos, sheets, studentPosition ou gradeKey divergirem da instância gerada.

### 3. Regressão

Novos testes:

- `tests/banco-notas-xlsx-workbook-serializer.test.ts`;
- `tests/banco-notas-workbook-presentation.test.ts`.

A evidência verifica estrutura ZIP/OOXML, determinismo, hidden metadata, roster, headers, colisões e inconsistências de identidade.

## Limite da evidência XLSX

O serializador deixou de ser somente um boundary futuro: há geração física real de bytes XLSX.

Ainda **não** foi comprovado o round trip em Microsoft Excel, Graph ou SharePoint real. Até essa homologação externa, não afirmar compatibilidade operacional completa com Excel. O que está comprovado é a estrutura OOXML/ZIP gerada e suas invariantes internas.

## Importação e análise

A state machine continua:

```text
draft
→ analyzed
→ generated
→ validated
→ ready_to_share
→ shared
→ connected
```

`draft → analyzed` somente ocorre pelo pipeline verificado:

```text
job draft
→ valida hash/formato/ano
→ valida bytes
→ LegacyWorkbookAnalyzer
→ ImportAnalysis imutável
→ findings + audit + analyzed no mesmo commit
```

A migration `0005_banco_notas_import_analysis.sql` bloqueia `analyzed` sem artefato persistido.

O adapter concreto de analyzer XLSX ainda falta. Não existe parser XLSB cloud comprovado.

## Migrations

Disponíveis:

- `0001_banco_notas_foundation.sql`;
- `0002_banco_notas_cross_year_integrity.sql`;
- `0003_banco_notas_import_job_state_machine.sql`;
- `0004_banco_notas_import_finding_resolution.sql`;
- `0005_banco_notas_import_analysis.sql`.

Ainda não foram aplicadas num D1 remoto.

O smoke remoto está em `infra/banco-notas/cloudflare/smoke-homologation.ps1`. Ele exige confirmação explícita de escrita sintética e recusa database name diferente de `banco-notas-homologation`.

## Decisões que não podem regredir

- Banco de Notas é módulo nativo do Centro no mesmo repo/deploy;
- HeroUI React v3 nativo;
- D1 é estado transacional; SharePoint/OneDrive são arquivos/versões; Graph só no backend;
- `SyncEnabled=false` por padrão;
- fontes não se misturam silenciosamente;
- ausência é diferente de zero;
- add-in público exige bearer Entra próprio, nunca cookie administrativo;
- `draft → analyzed` exige análise backend verificada;
- layout físico é versionado;
- `studentPosition` é canônico; não ordenar por UUID;
- serializador deve consumir o layout/mappings versionados, nunca criar segunda regra paralela de células;
- `_BancoNotas` é aba interna reservada;
- golden masters privados nunca entram em Git/runtime/D1/migrations/fixtures públicas/distribuição;
- não declarar suporte XLSB cloud sem adapter comprovado;
- não fazer merge, retirar draft ou deploy de produção sem autorização humana explícita.

## Arquivos para retomar

Leia nesta ordem:

1. `AGENTS.md` e `.app-factory.json`;
2. `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
3. `shared/banco-notas-generic-model.ts`;
4. `shared/banco-notas-workbook-pipeline.ts`;
5. `shared/banco-notas-workbook-presentation.ts`;
6. `server/banco-notas/generic-model.ts`;
7. `server/banco-notas/workbook-pipeline.ts`;
8. `server/banco-notas/workbook-presentation.ts`;
9. `server/banco-notas/xlsx-workbook-serializer.ts`;
10. `server/banco-notas/import-analysis.ts` e `d1-import-analysis-repository.ts`;
11. migrations `0001`–`0005`;
12. OpenAPI/AsyncAPI e `VERIFICATION.md`.

## Próximo avanço sem credenciais

Prioridade: implementar um analyzer XLSX concreto pelo boundary existente e ligá-lo ao modelo intermediário usando apenas fixtures sintéticas e regras genéricas. Não especializar o parser pelos arquivos Nina/Alanna.

Depois, compor um teste local completo:

```text
XLSX sintético de legado
→ analyzer real
→ LegacyIntermediateModel
→ relationship resolution
→ TransformationPlan
→ GenericModelInstance
→ apresentação canônica
→ XLSX novo real
```

## Próximo avanço com credenciais

1. provisionar somente `banco-notas-homologation`;
2. aplicar migrations `0001`–`0005`;
3. executar o smoke remoto;
4. abrir/gravar o XLSX gerado em Excel real e homologar round trip;
5. provisionar audience/delegated scope Entra;
6. conectar grade-events público;
7. conectar Graph/SharePoint real;
8. executar QA e piloto individual com sync desligado até reconciliação.
