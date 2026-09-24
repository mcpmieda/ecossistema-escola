# Políticas do Fechamento do trimestre — aplicação produtiva 0020

Em 23/09/2026, com autorização explícita do responsável, o SQL de
`migrations/student-portal/0020_term_closing_policy_v1.sql` foi aplicado no Supabase
`ecossistema-escola` pela operação de migração do serviço. A versão registrada é
**`20260923193137`** (`student_portal_term_closing_policy_v1`). Blob Git do arquivo:
**`ce016f7ba3ca338848c6a41d50a8d69621e87d37`**.

As instruções `BEGIN`/`COMMIT` do arquivo foram omitidas porque a operação de migração já roda
numa transação. O restante é idêntico, inclusive os `SET LOCAL` de tempo limite.

## Motivo da aplicação neste momento

O Worker da PR #1136 (merge `2f182c20`) já estava publicado. A leitura de "Políticas
personalizadas" no painel admin validava os padrões da escola direto do banco, sem o tratamento
de campos ausentes, e passou a responder "Consulta indisponível" enquanto a 0020 não existia.
A aplicação resolve o sintoma imediatamente. A correção de código que torna essa leitura
tolerante à ordem entre deploy e migração vem nesta mesma entrega, com teste de regressão.

## Pré-verificação

- A `main` estava em `6a4ac4d6`, que inclui a #1136 e a #1135. O deploy oficial desse SHA concluiu com sucesso.
- Escola com 7 linhas de política, todas na mesma época (`epochs = 1`).
- `student_portal_setting_field_v1` ainda aceitava só os 7 campos originais.
- A 0020 não constava no histórico de migrações do Supabase. A última versão do Portal era `20260923164053` (0019).

## Pós-verificação técnica

| Verificação | Resultado |
| --- | --- |
| Histórico do Supabase | `20260923193137`, `student_portal_term_closing_policy_v1` |
| Linhas de política da escola | 9, todas na época 53 (`epochs = 1`) |
| `showTermClosing` / `termClosingConclusive` | `false` / `true` (recurso segue desligado para os alunos) |
| Restrição `student_portal_setting_field_v1` | aceita os 9 campos |
| [`https://aluno.escolaieda.com/healthz`](https://aluno.escolaieda.com/healthz) | HTTP 200 |
| `https://admin.escolaieda.com/` | HTTP 200 |

Nenhum dado de aluno foi lido ou alterado. A migração é aditiva: não remove nem reescreve
configurações existentes.

## Validação funcional

Pendente com o responsável: abrir "Políticas personalizadas" no painel do aluno do Centro de
Administração e confirmar que a lista volta a carregar.
