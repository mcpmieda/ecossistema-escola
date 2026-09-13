# Recuperação técnica P1

O gate externo `portalServingGateV1` deve ser fechado **antes** de restaurar o banco. Ele pertence à configuração do deploy, fora do snapshot PostgreSQL. A #715 deve aplicá-lo antes das rotas de negócio, mutações administrativas e materialização agendada, mantendo liveness e diagnóstico autenticado. Valor ausente ou diferente de `true` recusa atendimento. Esse gate técnico não substitui calendário, bloqueio individual ou autorização para abrir a operação escolar.

## Procedimento de incidente

1. Fechar o gate, publicar pelo workflow oficial e confirmar 503 nas rotas de negócio. Suspender materialização; preservar acesso aos diagnósticos. Não iniciar restore enquanto houver atendimentos ou writers ativos.
2. Registrar privadamente o snapshot e os commits envolvidos. Preservar todas as versões de chaves QR e peppers necessárias; nunca substituir uma chave antiga por outra sob o mesmo número. Ausência de chave deve impedir acesso, sem fallback criptográfico.
3. Restaurar somente com plano e autorização próprios para o ambiente real. Um snapshot antigo pode conter QR, sessão, senha, PIN e confirmação de nascimento anteriores às revogações. Não reabrir com base apenas em integridade estrutural ou deploy saudável.
4. Reconciliar segurança sob o lock global exclusivo, antes dos locks anuais e das contas. Revogar sessões/QR restaurados, consumir desafios/previews, invalidar verificadores de senha/PIN, bloquear contas, suspender população e invalidar projeções/jobs/recibos restaurados. Preservar autoridade acadêmica, auditoria, versões de chaves, revisões e tombstones de encerramento de vínculo.
5. Confirmar nascimento e decisões administrativas contra fonte privada atual. Não transformar dados reais em `unconfirmed-test` por conveniência. Qualquer correção/limpeza produtiva precisa constar do plano específico; o helper de ensaio só aceita o banco local `portal705_test` e não é importado pelo Worker.
6. Revalidar ACL, fonte BN, calendário, vínculos, chaves, publicações autorizadas e negativas de credenciais antigas. Reemitir/reconfirmar acesso somente no escopo autorizado. Abertura geral não decorre dessa validação.
7. Publicar código compatível com o schema aditivo e abrir o gate apenas após concluir a reconciliação. Observar erros, backlog e latências; fechar novamente em caso de dúvida de integridade.

## Rollback de código

Reverter a entrega afetada pelo workflow oficial, mantendo schema, guarda do reset e histórico de segurança. Desligar a capacidade afetada antes do rollback se o código anterior não reconhecer as versões atuais. Não restaurar um banco antigo para reverter apenas código. Não reativar QR/sessão nem remover o gate por causa de um erro de deploy.

## Ensaio reproduzível

`migrations.postgres.ts` cria um snapshot SQL real de tabelas de segurança inteiramente sintéticas, revoga uma sessão/QR e repõe o estado anterior. O Worker real com gate fechado responde 503. Uma falha injetada no meio da quarentena faz rollback completo, mantendo o gate fechado; a repetição bem-sucedida torna as credenciais antigas inutilizáveis e mantém alunos/tombstones. O ensaio não é um serviço de backup, nem mede pg_dump/pg_restore, RPO ou RTO.

Não há detecção automática garantida de restauração feita fora desse procedimento. Backup gerenciado, RPO/RTO e automação de DR permanecem pós-entrega; o gate e a reconciliação são obrigações operacionais atuais.
