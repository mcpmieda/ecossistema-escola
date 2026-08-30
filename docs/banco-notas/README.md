# Banco de Notas — índice operacional

Esta pasta reúne a documentação operacional viva do Banco de Notas. Ela complementa os contratos, runbooks e evidências históricas já existentes em `docs/` sem mover ou duplicar artefatos antigos.

## Decisão vigente

- [Upload manual V1 — decisão e escopo](DECISAO_UPLOAD_MANUAL_V1_2026-08-30.md)
- [Progresso end-to-end e erros encontrados](PROGRESSO_END_TO_END_2026-08-25_A_2026-08-30.md)

## Pausas seguras

- [Histórico consolidado das pausas seguras](checkpoints/HISTORICO_PAUSAS_SEGURAS_2026-08-28_A_2026-08-30.md)
- [Checkpoint canônico atual](checkpoints/PAUSA_SEGURA_ATUAL_2026-08-30.md)

## Regras de segurança desta pasta

- não versionar planilhas reais, notas, nomes de estudantes, tokens, códigos de autenticação, senhas ou segredos;
- não versionar OID, UPN ou identificadores Graph/Drive pessoais quando um rótulo operacional for suficiente;
- registrar SHA, deployment, workflow e contagens somente quando necessários para retomar ou auditar;
- toda retomada deve revalidar o estado vivo; um checkpoint não prova que o ambiente permaneceu inalterado depois de sua data.

## Documentação histórica relacionada

- `docs/BANCO_NOTAS_ARCHITECTURE_V1.md`
- `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`
- `docs/BANCO_NOTAS_HANDOFF.md`
- `docs/BANCO_NOTAS_GO_LIVE_V1_CHANGE_PLAN.md`
- `docs/BANCO_NOTAS_GO_LIVE_V1_PILOT_RUNBOOK.md`
- `docs/BANCO_NOTAS_ADDIN_COTIDIANO_V1.md`
- `docs/BANCO_NOTAS_SYNC_V1.md`
- `docs/BANCO_NOTAS_SYNC_V1_THREAT_MODEL.md`
