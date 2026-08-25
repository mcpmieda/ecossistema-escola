# Banco de Notas — verificação do hardening da Fase 1

Data: 25/08/2026

PR: `#52`

Branch: `feat/banco-de-notas-foundation`

## Escopo verificado

Esta evidência cobre o hardening executado depois da revisão independente da primeira implementação material da Fase 1.

Foram tratados:

- remoção de controles HTML manuais na interface do Banco e substituição por componentes HeroUI nativos;
- remoção do CSS dedicado a simular inputs/selects do design system;
- integridade entre ano letivo e fontes/vínculos na persistência;
- justificativa obrigatória para patches administrativos de fonte e vigência;
- auditoria com ator, motivo e before/after;
- edição de ambiente, migration state e status da fonte;
- eliminação de resultado fictício de reconciliação;
- execução real das migrations em SQLite por processo Node isolado;
- testes de Origin para mutações;
- regressão estrutural de deep-link path-based;
- proteção contra limpeza acidental de `effectiveTo` ao editar uma vigência existente;
- limpeza de `effectiveTo` somente por intenção explícita (`clearEffectiveTo=true`);
- validação do período resultante antes da escrita, com erro de entrada em vez de falha interna.

## Persistência

Migrations verificadas:

- `infra/banco-notas/d1/migrations/0001_banco_notas_foundation.sql`
- `infra/banco-notas/d1/migrations/0002_banco_notas_cross_year_integrity.sql`

O harness `tests/helpers/banco-notas-sqlite-runtime.mjs` executa as migrations em banco SQLite real em memória e devolve evidências estruturadas consumidas por `tests/banco-notas-migration.test.ts`.

A regressão prova:

- criação do schema esperado;
- `sync_enabled=0` por padrão;
- rejeição de fonte de outro ano em `source_assignments`;
- rejeição de sobreposição autoritativa;
- aceitação explícita de fonte `reference_only` concorrente;
- aceitação de override docente separado do default anual;
- rejeição de componente/turma de ano incompatível em vínculo docente;
- rejeição de import job ligado a fonte de outro ano;
- zero como valor válido, separado de ausência;
- idempotency key única;
- colisão de sequence rejeitada;
- ausência com valor rejeitada;
- `grade_events` append-only;
- `audit_events` append-only;
- rollback de transação quando uma instrução posterior viola integridade.

### Limite

A evidência acima usa SQLite real compatível com o dialeto usado pelo D1, mas não é execução contra uma instância Cloudflare D1 remota. A homologação no D1 real continua obrigatória antes de qualquer piloto ou produção.

## Interface

`Configurações > Fonte` usa componentes HeroUI React v3 nativos para campos e seleções, incluindo `TextField`, `Input`, `Select`, `ListBox` e `Switch`.

A regressão falha se controles HTML `input`, `select` ou `option` voltarem a ser usados diretamente na tela do Banco. shadcn, ReUI e Ambient Constellation permanecem proibidos.

A edição administrativa agora cobre:

- environment;
- migration state;
- source status;
- authority;
- `SyncEnabled`;
- período de vigência;
- motivo obrigatório da alteração.

### Segurança específica da edição de vigência

A tela corrente envia `effectiveTo=null` quando o campo opcional fica vazio. O contrato agora normaliza esse `null` para **sem alteração**, evitando encerrar/abrir uma vigência por acidente. Remover deliberadamente uma data final exige `clearEffectiveTo=true` no contrato. O repositório também calcula o período final completo e rejeita `effectiveFrom > effectiveTo` antes da escrita.

A pré-carga visual das datas da vigência selecionada ainda não foi implementada; isso permanece como acabamento de UX antes de promoção do módulo. A proteção de servidor impede que essa limitação provoque limpeza silenciosa da data final.

## Segurança

A cobertura confirma:

- sessão e capabilities continuam exigidas;
- leitura e escrita usam capabilities distintas;
- mutation sem `grades.sources.manage` é rejeitada;
- patches sem motivo são rejeitados;
- Origin cross-site é rejeitado antes do storage;
- Origin oficial passa o gate e, sem D1, o sistema falha fechado com storage indisponível;
- `effectiveTo` não é limpo por campo vazio;
- limpeza de `effectiveTo` exige intenção explícita;
- período resultante inválido é tratado como entrada inválida.

## Deep-link

`tests/banco-notas-deeplink.test.ts` protege estruturalmente:

- despacho pelo pathname `/banco-de-notas`;
- `BrowserRouter basename="/banco-de-notas"`;
- subrota `/configuracoes/fonte`;
- ausência de rota hash definitiva do Banco;
- `_routes.json` restrito a `/auth/*` e `/api/*`, deixando a rota do módulo no fallback SPA;
- ausência de `public/404.html` que alteraria esse comportamento esperado.

### Limite

Essa regressão é estrutural. Não equivale a browser QA real com navegação, refresh e viewport desktop/mobile em uma implantação de homologação.

## CI

Baseline funcional já verde antes deste complemento:

`de19c4e5774f4f4eca5009e8fd9e93640226e524`

Workflow:

`32908018584` — run `#449` — **success**.

Resultados:

- `Validate GitHub Actions security` — success;
- `format:check` — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — success;
- build — success.

O complemento de edição segura de vigência acrescenta `tests/banco-notas-assignment-edit.test.ts`. O head final deste complemento deve ser considerado verificado somente quando sua própria CI terminar verde.

O PR permanece em draft. `Deploy production` e verificação pós-deploy não são executados como liberação da Fase 1.

## Pendências externas

Ainda não comprovados:

- D1 remoto de homologação;
- registro SharePoint aplicado ao tenant;
- browser QA real;
- add-in definitivo;
- audience/scope Entra do add-in/API;
- OpenAPI/AsyncAPI definitivos no novo repositório;
- `grade-events` transacional completo;
- pipeline cloud do modelo genérico;
- reconciliação Graph;
- regressão privada Nina/Alanna no novo conversor.

Nenhuma dessas pendências deve ser mascarada por mocks ou descrita como concluída antes da evidência real.
