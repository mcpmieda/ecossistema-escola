# Fotos — migrações

`0001`–`0004` são a base privada da #1119 já registrada no projeto Supabase. Não reaplicar essas versões nem a identidade `student-portal/0018` em produção.

`0005_supabase_storage_v1.sql` substitui a entrega binária permanente por referência ao bucket privado `student-photos`. A migration aborta caso encontre entregas ou ativos antigos, revoga a cópia quando a principal muda e remove o espelhamento de novas fotos para colunas SharePoint. As funções novas não são expostas a `anon`, `authenticated`, `service_role` ou ao backend do aluno. `adopt_storage_photo_v1` é exclusiva da migração administrativa.

Depois de conferir os 361 objetos e as referências originais, publicar os backends com a credencial privada configurada e executar [o roteiro de adoção](../../scripts/student-photos/adopt-storage-v1.sql). O roteiro exige a contagem, os hashes agregados dos inventários e a correspondência única UID/objeto/tamanho; uma divergência aborta a transação inteira. Nenhum arquivo de origem é excluído. Verificar as entregas, RLS/ACL, Portal e editor no ambiente real antes de declarar aceite.
