# Banco de Notas — Release notes GO-LIVE V1

Release candidate e deployment permanecem `PENDING` até o merge verde do control plane de produção. O RC usará o tag explícito `banco-notas-go-live-v1-rc.1`, pois o repositório não possuía convenção anterior de tags/releases.

## Incluído

- Centro de Administração: Acompanhamento, Turmas, Alunos, Professores, Pesquisa e Central;
- add-in NAA com contexto governado, análise local, preflight, commit e outcome;
- Sync V1 atômico, idempotente, otimista e default-deny;
- kill switches globais, allowlist piloto e readiness automatizada;
- attempts, duplicatas, duração, último sucesso e pendências factuais;
- recovery, threat model, change plan, support e pilot runbook.

## Compatibilidade e rollout

Migration `0008` é forward-only e não destrutiva. Flags nascem desligadas. A distribuição começa em piloto mínimo e somente modelos `ready` podem receber elegibilidade. O release record final deve substituir `PENDING` por release SHA, deployment ID, D1 production UUID/migrations, add-in version/coorte, rollback target e estado final do sync.

## Configuração do RC

- D1 exclusivo: `banco-notas-production` via binding `BANCO_NOTAS_DB`;
- migrations: `0001`–`0008`, em ordem, após export pré-migration;
- runtime: `RUNTIME_ENVIRONMENT=production`, audience do add-in, scope `BancoNotas.Sync` e context route habilitada;
- write gates no primeiro deploy: `sync_enabled=0`, `commit_route_enabled=0`, piloto habilitado = 0;
- add-in: manifest `af34971f-b05f-4b52-8048-71f36b40c9fb`, versão `1.0.0.0`;
- rollback: deployment Pages capturado no snapshot, seguido por sync off/revogação sem apagar histórico.
