# Projeção legada do Portal — aplicação produtiva 0019

Em 23/09/2026, com autorização explícita do responsável, o SQL inalterado de
`migrations/student-portal/0019_remove_legacy_projection_v1.sql` foi aplicado
no Supabase `ecossistema-escola` pela operação de migração do serviço. A versão
registrada é **`20260923164053`** (`student_portal_remove_legacy_projection_v1`);
o número da versão é o identificador retornado pelo serviço, não uma afirmação
sobre o fuso horário da execução. Blob Git do arquivo: **`54aef301d949cbe5da5de07977580722491563ad`**.

## Pré-verificação

- A `main` estava limpa em `f01a410a8dd3e58ff1ee664ba3ee2e5b424aa20c`, que contém o merge da PR #1122 e as correções da #1134. O deploy oficial [run 35901528852](https://github.com/mcpmieda/ecossistema-escola/actions/runs/35901528852) concluiu com sucesso nesse SHA, incluindo o backend do Portal e o entrypoint HTTPS.
- `student_portal.publication_control_v2` tinha `enabled = true` para `academic_year = 2026`.
- `student_portal.published_projection` ainda existia, com 347 linhas. Esta é somente uma contagem agregada; nenhum dado de aluno foi extraído.
- A 0019 ainda não constava no histórico de migrações do Supabase. A última versão registrada era `20260922212633` (0018).
- Antes da migração, o responsável havia confirmado por login real que as notas apareciam no Portal publicado. Essa observação precede a remoção da tabela.

## Pós-verificação técnica

| Verificação | Resultado |
| --- | --- |
| Histórico do Supabase | `20260923164053`, `student_portal_remove_legacy_projection_v1` |
| `to_regclass('student_portal.published_projection')` | `NULL` |
| `synchronize_profiles_v1(boolean)` | existe; `pg_get_functiondef` não contém `published_projection` |
| Publicação escopada V2 para 2026 | continua habilitada |
| Tabelas de `student_portal` | 27, contra 28 antes da 0019 |
| [`https://aluno.escolaieda.com/healthz`](https://aluno.escolaieda.com/healthz) | HTTP 200, `state: ok` |

## Validação funcional

Em 23/09/2026, **após** a 0019 e o deploy oficial do merge `5ad5ae47`, o
responsável confirmou por login real que as notas continuam aparecendo no
Portal. Essa é a validação funcional autenticada desta operação; nenhuma nota,
identidade, credencial ou captura de tela foi registrada no repositório. O
healthcheck e as consultas de catálogo comprovam separadamente a disponibilidade
e o efeito do DDL. A tabela removida não pode ser recuperada por rollback de
código.
