# Banco de Notas — Release notes GO-LIVE V1

O RC.1 (`249a21d06263fe6529a36c0d3458c50219604288`) foi interrompido ao resolver o D1 recém-criado. O RC.2 (`10dbe4fd5aedac63cc44bf047484269e49738e8e`) foi interrompido antes da primeira migration pela opção removida `--yes`. O RC.3 (`2827637ee6b9d964d1ba7232837187eaafa89d04`) aplicou as migrations 0001–0008, mas o Pages recusou `keep_vars`. O RC.4 (`fc727c7017d647fc6e92f6d1ec583551ca19f0b8`) publicou o Pages com gates em zero, porém o smoke detectou que `/api/*` caía no HTML estático porque a execução a partir da pasta temporária não encontrou `functions`; o rollback imediato restaurou `631603f7-cec8-4915-bf7b-0873fbbf56bb`. O próximo candidato usa o redirecionamento oficial de configuração gerada mantendo o Wrangler na raiz e resolve o deployment ativo por `canonical_deployment`. Tags anteriores permanecem imutáveis.

## Incluído

- Centro de Administração: Acompanhamento, Turmas, Alunos, Professores, Pesquisa e Central;
- add-in NAA com contexto governado, análise local, preflight, commit e outcome;
- CSP do taskpane destaca a política global anti-frame antes de permitir exclusivamente ancestrais Microsoft Office;
- Sync V1 atômico, idempotente, otimista e default-deny;
- kill switches globais, allowlist piloto e readiness automatizada;
- attempts, duplicatas, duração, último sucesso e pendências factuais;
- recovery, threat model, change plan, support e pilot runbook.

## Compatibilidade e rollout

Migration `0008` é forward-only e não destrutiva. Flags nascem desligadas. A distribuição começa em piloto mínimo e somente modelos `ready` podem receber elegibilidade. O release record final deve substituir `PENDING` por release SHA, deployment ID, D1 production UUID/migrations, add-in version/coorte, rollback target e estado final do sync.

## Configuração do RC

- D1 exclusivo: `banco-notas-production` via binding `BANCO_NOTAS_DB`;
- migrations: `0001`–`0008`, em ordem, após bookmark de Time Travel e export pré-migration efêmero; somente hash, tamanho e referência de restauração entram na evidência;
- runtime: `RUNTIME_ENVIRONMENT=production`, audience do add-in, scope `BancoNotas.Sync` e context route habilitada;
- write gates no primeiro deploy: `sync_enabled=0`, `commit_route_enabled=0`, piloto habilitado = 0;
- add-in: manifest `af34971f-b05f-4b52-8048-71f36b40c9fb`, versão `1.0.0.0`;
- rollback: deployment Pages capturado no snapshot, seguido por sync off/revogação sem apagar histórico.
