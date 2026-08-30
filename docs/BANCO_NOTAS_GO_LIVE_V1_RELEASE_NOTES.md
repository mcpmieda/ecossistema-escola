# Banco de Notas — Release notes GO-LIVE V1

O RC.1 (`249a21d06263fe6529a36c0d3458c50219604288`) foi interrompido antes de backup, migrations, binding e deploy Pages por colisão com a variável automática PowerShell `$Matches` ao resolver o D1 recém-criado. O RC.2 (`10dbe4fd5aedac63cc44bf047484269e49738e8e`) obteve bookmark/export e foi interrompido antes da primeira migration porque Wrangler 4.125 rejeita a opção removida `--yes`; o SQL efêmero foi apagado pelo `finally`. O próximo candidato remove essa opção, suprime a saída do export para não registrar URLs assinadas e não move tags anteriores. O D1 `e59579db-aa8b-4589-a02e-643cb4277b5f` continua sem migrations e o deployment Pages anterior permanece ativo.

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
