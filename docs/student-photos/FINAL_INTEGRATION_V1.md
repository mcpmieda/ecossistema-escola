# Fotos: Supabase Storage privado — #1119

## Uso

As fichas administrativas e de desempenho usam o mesmo painel. Conta e matrícula/ano são resolvidas para o `studentUid`; nomes não são chave de associação. O editor gera WebP 3×4 com fundo e avatar 1×1, com prévia e confirmação explícita. Ajustar apenas o avatar preserva a principal. Salvar e remover mantêm revisão, recibo idempotente e recuperação de operação pendente.

O aluno recebe sua foto pela rota da própria origem. A leitura confere sessão, vínculo, `accessEnabled`, aprovação e revisão no PostgreSQL antes de buscar o objeto privado. Falha da foto não encerra a sessão nem bloqueia notas. Sem foto, o Portal não mostra retrato; a interface administrativa usa o círculo de cor estável.

## Armazenamento e segurança

O bucket `student-photos` é privado, limitado a WebP de 128 KiB. Principal e avatar têm caminhos imutáveis por UID, pedido e hash. O upload não sobrescreve objeto; reexecução confirma os bytes existentes. A leitura refaz SHA-256, tamanho e dimensões. A limpeza só alcança a chave exata do recibo aposentado, após publicar a nova referência. Remoção no Storage é permanente; originais de importação no SharePoint não são tocados.

O PostgreSQL conserva metadados de entrega e autorização, sem `bytea` permanente após a migração. O payload transitório de recuperação é excluído ao concluir o recibo. A chave de serviço do Supabase é segredo dos backends Pages e Worker, nunca enviada ao browser, armazenada no banco ou registrada em logs. As rotas não expõem URL pública, signed URL, localizador de objeto ou cache público.

## Migração e publicação

1. Confirmar a base `0001`–`0004`, as 361 referências e a ausência de entregas/ativos antigos.
2. Conferir os 361 objetos privados por contagem, bytes, tamanho, formato, dimensões e SHA-256; comparar as referências legadas antes/depois. O acervo original permanece intacto.
3. Aplicar `0005_supabase_storage_v1.sql`, configurar `PHOTO_STORAGE_SERVICE_KEY` nos dois backends e publicar pelo workflow oficial. A migration impede a troca se houver entregas ou ativos antigos não migrados.
4. Adotar as cópias verificadas por `studentUid` com `adopt_storage_photo_v1`, conferir 361 famílias e entregas privadas, zero blobs permanentes, RLS/ACL e ausência de pendências. Registrar SHA, CI, deploy e diagnóstico na #1119.
5. O responsável testa no ambiente real visualização, edição, avatar, remoção e Portal com os participantes que escolher. Registrar implantação e aceite separadamente.

O protocolo visual e acadêmico existente permanece: principal até 900×1200, alternativa 600×800, avatar até 320×320, sem remoção de fundo/IA e sem nova coleta de consentimento. Não alterar contas, credenciais de alunos, notas ou turmas para testar fotos.
