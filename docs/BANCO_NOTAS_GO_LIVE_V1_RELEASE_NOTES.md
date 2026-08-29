# Banco de Notas — Release notes GO-LIVE V1

Release e deployment permanecem `PENDING` até a integração e o RC.

## Incluído

- Centro de Administração: Acompanhamento, Turmas, Alunos, Professores, Pesquisa e Central;
- add-in NAA com contexto governado, análise local, preflight, commit e outcome;
- Sync V1 atômico, idempotente, otimista e default-deny;
- kill switches globais, allowlist piloto e readiness automatizada;
- attempts, duplicatas, duração, último sucesso e pendências factuais;
- recovery, threat model, change plan, support e pilot runbook.

## Compatibilidade e rollout

Migration `0008` é forward-only e não destrutiva. Flags nascem desligadas. A distribuição começa em piloto mínimo e somente modelos `ready` podem receber elegibilidade. O release record final deve substituir `PENDING` por release SHA, deployment ID, D1 production UUID/migrations, add-in version/coorte, rollback target e estado final do sync.
