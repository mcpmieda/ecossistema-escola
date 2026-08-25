# Banco de Notas — Implementation State

Última atualização: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

Fase: **1 — fundação executável + hardening pós-review**

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
- testes de domínio, migration, API, contrato, UI, autorização, Origin, deep-link estrutural e isolamento dos golden masters.

## Hardening pós-review

A revisão independente da primeira implementação encontrou pontos que não seriam aceitos para merge. Eles foram tratados no mesmo PR:

1. **HeroUI nativo:** os controles HTML manuais de `Configurações > Fonte` foram substituídos por `TextField`, `Input`, `Select`, `ListBox` e `Switch` do HeroUI. O CSS específico que simulava controles do design system foi removido.
2. **Integridade por ano letivo:** a camada de persistência agora rejeita `source_assignments`, `teacher_assignments`, `relationship_snapshots` e `import_jobs` quando as entidades relacionadas pertencem a outro ano letivo.
3. **Auditoria de patches:** alteração de fonte ou vigência exige motivo; o repositório registra ator, motivo e before/after no evento de auditoria.
4. **Fonte editável:** ambiente, estado da migração e status deixaram de ser somente informativos e passaram a possuir fluxo de atualização.
5. **Sem reconciliação fictícia:** a interface não exibe uma data/resultado inventado antes da implementação real de reconciliação.
6. **SQL executável:** os testes deixaram de depender apenas de inspeção textual. Um processo Node separado executa as migrations em SQLite real e prova schema, defaults, conflitos de autoridade, integridade cross-year, idempotência, sequence, ausência versus zero, append-only e rollback transacional.
7. **Proteção de Origin:** mutações cross-origin são testadas como bloqueadas antes do acesso ao storage.
8. **Deep-link:** existe regressão estrutural específica para `/banco-de-notas` e `/banco-de-notas/configuracoes/fonte`, garantindo path routing sem hash e preservando o fallback SPA do Cloudflare Pages.

## Evidência de CI do hardening

Head verificada antes desta atualização documental: `de19c4e5774f4f4eca5009e8fd9e93640226e524`.

Workflow `32908018584` — run `#449` — **success**:

- `Validate GitHub Actions security` — success;
- formatação — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — success;
- build — success.

O PR continua em `draft`. Não houve deploy de produção nem merge.

## Limite da evidência atual

O executor SQL utiliza SQLite real no Node para validar o dialeto e os invariantes implementados nas migrations. Isso é evidência executável muito superior à inspeção de strings, porém **não substitui a homologação contra uma instância Cloudflare D1 remota**.

Da mesma forma, o teste de deep-link atual prova a composição path-based e a configuração de fallback do repositório, mas **não deve ser descrito como browser QA real**. Browser QA desktop/mobile e refresh contra homologação continuam pendentes de ambiente executável apropriado.

## Estado externo

O D1 de homologação não foi criado porque o Wrangler local não possui sessão autenticada. Não há ID fictício no repositório e não houve deploy. O script `infra/banco-notas/cloudflare/provision-homologation.ps1` faz login, cria `banco-notas-homologation`, gera uma configuração local ignorada pelo Git e aplica as migrations em um único comando.

O registro SharePoint está implementado no provisionador idempotente, mas não foi aplicado ao tenant nesta fase.

## Segurança e defaults

- navegador não acessa Graph/SharePoint diretamente;
- mutations exigem sessão, capability específica e Origin oficial;
- health degrada de forma explícita se o binding D1 não existir;
- sincronização nasce desligada;
- nenhum dado real ou arquivo docente está no Git;
- Ambient Constellation, shadcn e ReUI não fazem parte do módulo;
- Nina e Alanna continuam exclusivamente como golden masters privados externos.

## Pendências antes do piloto

- provisionar D1 de homologação e executar as migrations no D1 real;
- aplicar o registro idempotente do módulo no SharePoint de homologação quando autorizado;
- executar browser QA real de desktop/mobile/deep-link/refresh;
- migrar OpenAPI/AsyncAPI;
- implementar jobs/importação e `grade-events` transacional;
- adaptar o add-in Office.js para a API definitiva;
- materializar o modelo genérico limpo;
- executar regressão privada externa com Nina/Alanna sem incorporar os arquivos ao produto;
- definir/provisionar audience/scope Entra próprio para o add-in antes do piloto.

## Próximo bloco funcional

Depois da homologação da fundação, avançar para contratos OpenAPI/AsyncAPI, pipeline de importação/modelo genérico, `grade-events`, add-in e reconciliação Microsoft. A promoção deve continuar gradual, com `SyncEnabled=false` até validação individual.

## Regra crítica permanente

Os arquivos privados de homologação citados em `BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md` não são produto, template, seed, fixture pública ou dependência. A produção deve transformar qualquer planilha docente legada numa instância nova do modelo genérico, sem regras dependentes de pessoa, abas, turmas, disciplinas ou células específicas.
