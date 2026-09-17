# Entrega de avisos remotos — continuação da #839

## Evidência operacional e limite

A consulta somente leitura de 17/09/2026, aproximadamente 17:11 UTC, encontrou 185 avisos na `live_event_outbox_v1`, todos pendentes, sem confirmação de entrega; havia tentativas repetidas nos avisos mais antigos. Isso é um bloqueio para reduzir polling com base em live saudável. Não prova a causa do timeout do navegador às 15:54 UTC.

O runtime atual usa postgres.js com `fetch_types:false`. A drenagem anterior tratava `integer[]` como array JavaScript e passava arrays JavaScript diretamente a `ANY($2::bigint[])`. A prova nativa desta entrega reproduz as opções reais e verifica separadamente ambas as fronteiras antes de testar a drenagem completa. O resultado efetivo do teste e da publicação será registrado na PR; não inferir aprovação deste documento.

## Correção restrita

A claim projeta `to_json(student_ids)`; confirmação e reagendamento recebem JSON textual validado e usam `jsonb_array_elements_text`. Não habilita descoberta global de tipos, não amplia pool, não aplica DDL, não altera ACL ou dados acadêmicos. Claims continuam curtas, chamadas ao Durable Object ocorrem depois da transação, e apenas o token proprietário confirma/reagenda. A confirmação conta as linhas efetivamente atualizadas, não apenas RPCs aceitas. Falhas mantêm o aviso para recuperação.

O Durable Object mantém seu maior cursor, mas não descarta silenciosamente evento atrasado/ambíguo: emite resync apenas do domínio envolvido, com filtragem de destinatários no servidor. Reconexão revalida ambos os domínios quando qualquer lado possui histórico, inclusive cursor igual ou superior ao servidor. Nenhum identificador de aluno/conta/turma passa ao navegador. Contrato público e tabela interna do DO permanecem iguais; nenhuma nova infraestrutura.

A drenagem registra apenas esquema fixo de agregados (horário, duração, resultado, quantidades claimed/accepted/acknowledged/rejected), sem IDs, tokens, conteúdo ou erro bruto. O Worker já possui observabilidade configurada. Isso não comprova retenção efetiva do fornecedor nem configura destinatário de alertas.

## Provas

Novo teste nativo PostgreSQL usa banco local descartável separado, com guard estrito 127.0.0.1, role real e factory produtiva. Testa arrays sem type discovery, claim/ack, falha e retomada, concorrência de dois drainers e privacidade dos agregados. Novo workerd cobre duas identidades administrativas independentes, publicação fora de ordem, retomada de cursor e filtragem de estudante. A suíte existente continua cobrindo ACL, isolamento e fanout.

## Operação posterior

Depois do deploy oficial, verificar os agregados da outbox novamente, aguardando a rotina existente: nenhum UPDATE manual, marcação artificial de sucesso ou exclusão de pendências. A recuperação periódica do frontend permanece necessária até comprovar produtores, entrega e consumo. Autenticação, calendário, CAS, drafts e integração de uma conexão administrativa continuam etapas próprias do pacote. A #839 não deve ser encerrada por esta PR isolada.
