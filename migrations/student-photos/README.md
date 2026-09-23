# Fotos — ledger separado da entrega privada

| Arquivo | Estado produtivo | Dependência |
| --- | --- | --- |
| `0001_private_delivery_v1.sql` | **Candidato; não aplicado** | Identidade `student-portal/0018`, já aplicada como `20260922212633` |

O schema privado `student_photos` pertence ao recurso transversal de fotos, não à matrícula anual nem às credenciais. A primeira tabela mantém apenas a cópia de entrega 3×4 com fundo, até 128 KiB. Não move originais do SharePoint, altera `profile_photo`, publica o acervo ou concede escrita ao runtime.

Aplicação somente após testes PostgreSQL, revisão, pré-flight e decisão operacional de ativação. Verificar que o schema não existe antes de aplicar; não usar `IF NOT EXISTS` para aceitar uma estrutura diferente silenciosamente. Não reaplicar a migration 0018.

`PORTAL_PHOTOS_ENABLED` permanece ausente/desativado. A existência desta migration no Git não é evidência de aplicação, aprovação de imagem ou implementação do editor/publisher.

A autorização é confirmação institucional de evidência mantida pela escola. A referência é privada; não anexar documentos, nomes ou fotos a issues, testes ou commits. O publicador futuro deve validar/decodificar/reencodar uploads, conferir autorização, revisão esperada e resultado SharePoint antes de gravar. Hash/magic bytes na entrega não substituem um decodificador de uploads.

Revogação requer retirar bytes (`image_webp=NULL`) e registrar `revoked_at`; o serviço de escrita, limpeza SharePoint e auditoria ainda pertencem à próxima entrega. A fundação não oferece atalhos manuais de publicação em produção.
