# Agendamentos de acesso: aplicação da 0021 em produção

Em 27/09/2026, com autorização explícita do responsável, o SQL de
`migrations/student-portal/0021_access_schedule_v1.sql` foi aplicado no Supabase
`ecossistema-escola` pela operação de migração do serviço. A versão registrada é
**`20260927100854`** (`student_portal_access_schedule_v1`). O blob Git do arquivo é
**`54b17d6898052b43be7329df594525e592725ccb`**.

O `BEGIN` e o `COMMIT` do arquivo ficaram de fora porque a operação de migração já roda dentro
de uma transação. O restante é idêntico, inclusive os `SET LOCAL` de tempo limite.

## Ordem

O Worker da PR #1194 (merge `acfd91ee`) foi publicado primeiro, e o deploy de produção concluiu
com sucesso. Esse Worker lê `accessSchedule` como opcional: sem linha, o nível segue a janela
de acesso do Calendário. A 0021 foi aplicada logo em seguida.

## Pré-verificação

- A restrição `student_portal_setting_field_v1` aceitava só os 9 campos da 0020.
- A 0021 não constava no histórico de migrações do Supabase. A última versão do Portal era
  `20260923193137` (0020).
- A escola tinha 9 linhas de política e havia 1 linha de turma (`risk`).
- Não havia nenhuma personalização de acesso por turma ou por aluno.

## Pós-verificação técnica

| Verificação | Resultado |
| --- | --- |
| Histórico do Supabase | `20260927100854`, `student_portal_access_schedule_v1` |
| Restrição `student_portal_setting_field_v1` | aceita os 10 campos, incluindo `accessSchedule` |
| Linhas de política | escola 9 e turma 1, cada uma em uma única época; nenhuma linha `accessSchedule` ainda |
| `GET /api/student/status` | `access: open`, igual ao estado anterior |
| [`https://aluno.escolaieda.com/healthz`](https://aluno.escolaieda.com/healthz) | HTTP 200 |
| `https://admin.escolaieda.com/` | HTTP 200 |

Nenhum dado de aluno foi lido ou alterado. A migração é aditiva e não tem semente: nenhuma
configuração existente foi removida ou reescrita. O comportamento só muda quando alguém salva
o cartão "Entrada no Portal" em Políticas → Acesso.
