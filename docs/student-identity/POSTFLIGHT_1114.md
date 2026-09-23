# Identidade compartilhada — aplicação produtiva #1114

## Evidência de aplicação

Em 22/09/2026, no horário da Bahia (23/09 em UTC), a migration
`student_portal_shared_student_identity_v1` foi aplicada no Supabase. A versão
**registrada pelo serviço** é `20260922212633`; não inferir seu fuso pelo nome.

Arquivo: `migrations/student-portal/0018_shared_student_identity_v1.sql`.
Blob exato: `0e4c1f1298c6f69e5acf12f4ebe0464ea0ea97ab`.
Head do SQL validado: `7092aefa5f05e1c74ae2da8e53a417df6ed1c54c`.
Registro operacional: issue #1114, avanços 14–17; PR #1115.

Antes da aplicação, passaram `npm run verify` (run `35801221768`), os gates
PostgreSQL (`35801221786`), Sonar (`106992098447`) e revisão CodeRabbit. O head
incorporava a main `fa56717b7dc83fb834749cffb57e3897f96b4821`, preservando o redesign
e as correções posteriores de sessão, assets, disciplinas e nomes longos.

## Pós-condições observadas

| Verificação | Resultado |
| --- | --- |
| Identidades canônicas | 384 |
| Alunos e contas | 384 em cada módulo |
| Vínculos com o mesmo `student_uid` | 384 |
| Contas existentes com UID igual ao UUID anterior | Todas |
| Referências de fotos preservadas | 270 |
| Campos preexistentes de alunos e contas | Assinaturas de integridade idênticas antes/depois, excluindo somente `student_uid` acrescentado |
| Fotos, credenciais, QR, sessões e dados de acesso | Contagens e assinaturas idênticas antes/depois |
| Colunas obrigatórias e vínculos consistentes | Aprovado |
| FKs existentes, validadas, com alvos/colunas/RESTRICT corretos | Aprovado |
| Guards/alocadores ativos, com modo de segurança correto | Aprovado |
| RLS privado e ausência de ACL pública/escrita direta de runtime | Aprovado |
| Advisor de segurança após migração | Zero alertas |

Catálogo Gradebook observado: **31 tabelas, 254 colunas, 227 constraints,
73 índices, 53 FKs, 13 sequências, 6 funções e 5 triggers**. A contagem anterior
era 30/251/223/70/52/13/4/3, na mesma ordem.

O schema Portal contém **28 tabelas**. `profile_photo` já existia antes desta
migração; a 0018 acrescenta a tabela de identidade no Gradebook, não no Portal.

As comparações de preservação incluem 35 sessões, 13 credenciais QR e sete
registros em cada conjunto de senha/PIN e dados de acesso. Nenhum valor de
credencial, token, UUID real ou fotografia é publicado neste documento.

## Papéis e compatibilidade

Os proprietários das tabelas são `postgres`; os papéis de runtime não possuem
objetos, superuser, BYPASSRLS nem memberships. A produção já tinha
`gradebook_app` com INHERIT=true; esse atributo não foi alterado. Sem memberships,
isso não concede os privilégios de proprietário. A guarda usa `current_user`
efetivo, não o usuário original da conexão, e o pós-flight verificou os
privilégios efetivos após a criação dos objetos.

Os campos adicionados são compatíveis com o runtime anterior. PKs acadêmicas e
de conta foram preservadas. Nenhuma migration, importação, sessão ou arquivo foi
recriado para trocar identificadores. Não houve escrita em notas ou SharePoint.

## Limites da evidência e continuidade

A aplicação no banco está comprovada; merge/deploy do código e a validação do
head documental final são registrados separadamente na issue/PR. A referência
ao head acima prova o SQL aplicado, não pretende identificar um merge futuro.

Não houve login manual de teste em conta real. Os testes de criação, tentativa
de reassociação e restore usaram massa sintética no PostgreSQL descartável; não
foram repetidos como escritas experimentais em alunos reais. Restore sintético
não equivale a backup gerenciado nem estabelece RPO/RTO institucional.

Editor de fotos, remoção de fundo, entrega binária e avatar nas telas continuam
uma entrega posterior. O recurso de identidade não publica retratos nem altera
`accessEnabled`. Rematrícula/fusão entre pessoas não é um fluxo novo autorizado.

Não reaplicar a 0018: ela já está no ledger. Uma correção posterior exige outra
migration revisada; não editar o SQL histórico, apagar a identidade ou regenerar
UUIDs como rollback improvisado. A continuidade do recurso de fotos usa
`studentUid` e preserva as referências SharePoint legadas por meio das contas.
