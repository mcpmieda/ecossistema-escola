# Fotos — ledger privado

| Arquivo | Estado produtivo | Dependência |
| --- | --- | --- |
| `0001_private_delivery_v1.sql` | **Candidato; não aplicado** | Identidade `student-portal/0018`, já aplicada como `20260922212633` |
| `0002_write_journal_v1.sql` | **Candidato; não aplicado** | Fotos 0001 |

A primeira migration mantém a cópia limitada de entrega 3x4 com fundo. A segunda acrescenta referências vigentes, reserva por pessoa, recibos idempotentes, auditoria privada e revogação automática da cópia antiga quando a principal muda. Nenhuma migra o acervo, renomeia arquivos, modifica profile_photo ou presume autorização de imagem.

0001 concede somente leitura filtrada ao Portal. 0002 concede ao backend administrativo acesso limitado ao estado/recibos e auditoria append-only. Não concede publicação, aprovação ou escrita direta na cópia do Portal. Seu trigger SECURITY DEFINER só revoga; não existe RPC público de publicação.

Aplicar em ordem somente depois de testes/revisão, pré-flight e autorização operacional. Verificar a baseline exata, sem IF NOT EXISTS para aceitar outra estrutura. **Não reaplicar a 0018.** PORTAL_PHOTOS_ENABLED continua ausente/desativado; a existência do SQL em Git não é prova de aplicação.

O escritor e coordenador internos estão em `server/student-photos/write-*.ts`; protocolo e testes em `docs/student-photos/WRITE_PROTOCOL_V1.md`. Nenhum endpoint/codec produtivo de upload está conectado nesta entrega. Cabeçalho/hash ou conversão no browser não substituem o decoder/reencoder real no servidor.

A escola mantém a evidência de autorização de imagem, sem anexar documentos ou dados reais ao Git. Ativação exige integração do acervo, codec comprovado, permissões Graph efetivas, recuperação e exclusão, autorização institucional e aceite. Restore deve reconciliar reservas/recibos com SharePoint antes de reabrir escrita; não reexecutar limpeza antiga automaticamente.
