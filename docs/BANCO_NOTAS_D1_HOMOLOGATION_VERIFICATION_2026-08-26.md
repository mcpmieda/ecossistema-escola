# Banco de Notas — homologação D1 remota — 2026-08-26

## Resultado atual

Homologação remota concluída com sucesso no database exclusivo do Banco de Notas:

- database: `banco-notas-homologation`;
- workflow: `Banco de Notas D1 homologation`;
- run inicial consolidado: `32973613431` / execução `#12`;
- run final do bloco de identidade: `32981705701` — **success**;
- commit final validado remotamente: `2467240b53bf3bbc5996905ba940b544cb35f266`;
- CI correspondente: `32981711631` — **success**;
- Wrangler observado durante o ciclo: `4.125.0`;
- migrations `0001`–`0007` aplicadas e exercitadas;
- estado final do smoke de identidade: `sync_enabled=0`.

Nenhum token, secret ou identificador sensível é registrado neste documento.

## Provisionamento

O provisionamento usa o Wrangler atual:

1. `wrangler d1 list --json` para localizar por nome exato;
2. reutiliza somente `banco-notas-homologation` quando há exatamente uma correspondência;
3. cria sem `d1 create --json` somente se o banco estiver ausente;
4. valida UUID/account;
5. confere o conjunto esperado de migrations antes de aplicar remotamente.

O provisionador atual está travado nas migrations `0001`–`0007` e recusa divergência de conjunto ou duplicidade do nome de homologação.

## Migrations remotas comprovadas

1. `0001_banco_notas_foundation.sql`;
2. `0002_banco_notas_cross_year_integrity.sql`;
3. `0003_banco_notas_import_job_state_machine.sql`;
4. `0004_banco_notas_import_finding_resolution.sql`;
5. `0005_banco_notas_import_analysis.sql`;
6. `0006_banco_notas_import_analysis_profiles.sql`;
7. `0007_banco_notas_teacher_entra_identity.sql`.

As migrations anteriores continuaram válidas após a `0007`; os smokes de core e analysis profiles permaneceram aprovados.

## Invariantes remotos já comprovados

O smoke principal continua cobrindo com dados sintéticos:

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

O smoke de profiles continua comprovando persistência e invariantes da migration `0006`.

## Migration 0007 — identidade Entra do professor

A `0007_banco_notas_teacher_entra_identity.sql` foi exercitada no D1 remoto de homologação.

O ciclo final comprovou:

- um modelo não pode entrar em sync quando o professor não possui Entra OID;
- a tentativa inválida falha e não deixa sync ativado;
- Entra OID é único entre professores;
- após atribuir uma identidade sintética válida, o smoke pode habilitar sync **temporariamente apenas para testar os locks**;
- enquanto esse sync sintético está ativo, troca do Entra OID é rejeitada;
- enquanto esse sync sintético está ativo, inativação do professor é rejeitada;
- depois das provas, o smoke desabilita o sync;
- a asserção final remota exige `sync_enabled=0`.

Isso fecha a lacuna da execução anterior, que ainda não exercitava os triggers de lock de OID/status.

## Segurança preservada

Durante toda a homologação:

- nenhum D1 de produção foi acessado ou alterado;
- nenhum Cloudflare Pages de produção foi alterado;
- nenhum Worker temporário de produção foi criado;
- o estado final de sync permaneceu desligado;
- Entra, Graph e SharePoint reais não foram modificados;
- credenciais D1 continuaram em GitHub Actions secrets;
- golden masters privados não participaram de migrations ou smokes;
- o PR #52 permaneceu open, draft e sem merge.

## O que esta evidência não prova

Esta homologação comprova o storage D1 e seus invariantes. Ela não deve ser usada para afirmar:

- Graph/SharePoint real homologado;
- audience/scope Entra real configurado;
- add-in público liberado;
- atomicidade por `D1Database.batch()` em binding Worker/Pages real;
- compatibilidade operacional final com Excel;
- browser QA.

Esses itens possuem gates próprios.

## Próximo bloco técnico

1. fechar a CI do adapter Graph reconstruído;
2. homologar upload/share/download/reanálise em Microsoft Graph/SharePoint real somente em ambiente de homologação autenticado;
3. preparar audience/scope Entra reais e ownership sem liberar endpoint público antes do gate completo;
4. validar `D1Database.batch()` por binding quando existir runtime Cloudflare de homologação autorizado;
5. avançar os módulos funcionais do Banco de Notas e, depois, browser QA/release.
