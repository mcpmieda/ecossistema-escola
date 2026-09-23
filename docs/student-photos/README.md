# Fotos do aluno — contrato vigente da #1119

## Decisão do responsável

Em22/09/2026 (Bahia), o responsável cancelou remoção de fundo, modelos de IA, pincéis e variantes transparentes. Permanecem **principal3×4 WebP COM fundo** e **avatar1×1 WebP**, com enquadramentos independentes. O círculo do avatar e o arco do Portal são apresentação, não variantes adicionais.

O editor continua uma entrega posterior: enviar/substituir, converter, enquadrar, salvar/cancelar e remover. Principal-alvo900×1200, alternativa600×800; nunca ampliar fonte menor. A cópia de entrega do Portal tem teto inicial128KiB. Qualidade, dimensão e orçamento precisam ser medidos no publicador; não há promessa de que qualquer900×1200 caiba nesse teto. Não reduzir silenciosamente a qualidade.

## Limite desta primeira entrega

Implementa contrato mínimo, leitor privado, rotas protegidas e transporte isolado de foto no Portal. A única conexão visual é `portraitSrc` em `src/student-portal/app.tsx`. Shell, workspace, CSS, login e assets não são redesenhados.

A branch `feat/student-portal-redesign-phase-3` foi apenas consultada; continua reservada ao responsável. **Não integrar, escrever nela ou abrir PR a partir dela.** A implementação parte da main com #1115. A ativação visual deve ser validada quando o responsável integrar o arco; esta fundação não antecipa esse merge.

**Produção continua sem fotos publicadas por esta entrega.** `PORTAL_PHOTOS_ENABLED` permanece ausente; não foi criada configuração de produção para habilitá-lo. O SQL em `migrations/student-photos/0001_private_delivery_v1.sql` é candidato, não aplicado. Não há API de upload/publicação, editor ou escritor privilegiado. A issue #1119 não está concluída.

## Origem e identidade

SharePoint permanece o repositório canônico. Preservar as270 referências legadas, ligando explicitamente `profile_photo.account_id` à conta e ao `studentUid` da #1115. Não associar pelo nome, renomear acervo ou presumir igualdade entre ID de conta e UID permanente. Não reaplicar a0018, já aplicada como20260922212633.

A tabela candidata `student_photos.portal_delivery_v1` guarda só uma cópia limitada de entrega por UID permanente; não movimenta originais para o banco. Portal tem leitura de versões aprovadas, sem escrita, credenciais Graph, chamadas SharePoint ou novo bucket. A permissão de escrita/publicação será projetada e revisada com o editor administrativo, não concedida por esta entrega.

## Leitura privada sem acoplar as notas

1. Após carregar o perfil, o cliente consulta `GET /api/student/photo`. Resposta204 significa ausência ou recurso desativado. Metadados200 contêm somente conta atual, revisão opaca e dimensões; nenhum localizador SharePoint, UID permanente, prova de autorização ou imagem.
2. `GET /api/student/photo/content?v=<revisão>` autoriza novamente pela sessão. O servidor resolve a conta → UID e exige aquela revisão. Não aceita seletor de aluno, parâmetros extras, download parcial ou retorno304 sem autorização.
3. As duas leituras usam o `SessionServiceV1` real, com snapshot somente leitura, incluindo elegibilidade atual, `accessEnabled`, bloqueios, calendário, expiração, revogação e versão de segurança. A foto não integra a transação de notas nem seu payload.
4. Respostas de foto usam `Cache-Control: private, no-store`, `Vary: Cookie`, `nosniff` e proteção de mesma origem. Não usar URL pública ou cache persistente.
5. O cliente baixa até128KiB pela própria origem, confere tipo e dimensões decodificadas, e passa um `blob:` descartável para `portraitSrc`. Isso evita uma segunda transferência e imagem quebrada no shell anterior. A CSP existente já permiteblob. O objeto é descartado ao sair, trocar conta ou atualizar explicitamente o perfil; respostas atrasadas são descartadas.
6. A leitura é opcional: ausência, erro, indisponibilidade ou timeout não alteram notas ou sessão. Não há polling, listener de foco, tentativa periódica, alteração de credenciais nem atualização automática de notas.

O hash e cabeçalhoRIFF/WebP do leitor verificam integridade de bytes **já aprovados**. Não são um decodificador ou validação completa de upload. O publicador deve decodificar/reencodar, remover metadados, limitar pixels/dimensões/tamanho e verificar enquadramento, sem ampliar a fonte. Nunca abrir uma rota de escrita que confie apenas no magic byte ou validação do navegador.

## Autorização e remoção

A escola deve confirmar autorização de uso da imagem dos responsáveis antes de publicar. A existência de um arquivo não comprova autorização. Nesta retomada nenhuma evidência foi fornecida nem marcada automaticamente. O registro candidato exige confirmação institucional, autor/data e referência privada, aprovação vinculada à revisão da fonte e ausência de revogação.

Não guardar nomes, documentos de autorização, fotos reais ou tokens no Git/CI/issues. A autorização registrada não é uma validação jurídica automática. A verificação documental pertence à escola; a aplicação impede entrega enquanto ela não estiver confirmada.

Revogar exige retirar bytes da cópia e registrar revogação. Exclusão SharePoint, limpeza de variantes/órfãos, concorrência entre operadores, recibos idempotentes e auditoria de publicação são pendências do publicador. Não anunciar exclusão definitiva sem verificar lixeira/retenção, nem prometer remover imagens já vistas ou backups retidos.

## Validação e ativação

Testes usam apenas imagens de cor sólida geradas e identificadores sintéticos. Há cobertura de contrato/HTTP, transporte, descarte de objetos e sessão real em PGlite; a configuração PostgreSQL oficial descobre o teste nativo da migration, ACL/RLS e identidade por `tests/student-portal/admin/*.postgres.ts`. Resultados efetivamente executados, SHA e ambiente ficam na PR/issue; presença de teste no Git não prova execução.

Antes de habilitar: aprovar gates/revisão, validar credencial Graph efetiva do admin, implementar editor e publicador com validação completa e CAS, testar qualidade de exportação, conferir autorização institucional, aplicar migration com pré/pós-flight, verificar a apresentação em arco integrada pelo responsável e testar uma conta autorizada sem expor sua imagem. Não habilitar por este README e não publicar o acervo em lote.
