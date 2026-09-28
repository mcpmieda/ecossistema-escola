# Políticas por turno — decisão de 28/09/2026

Contrato e escopo: [#1201](https://github.com/mcpmieda/ecossistema-escola/issues/1201).

Escopo aprovado pelo responsável na revisão local do Painel do Aluno. Integração e
deploy autorizados pelo responsável na retomada de 28/09/2026, condicionados aos
gates oficiais. Presença de código ou da migration não comprova publicação nem
aplicação em produção.

## Fonte e precedência

A Relação continua sendo a única fonte: `INICIO!I7:I28`, na linha da turma abreviada
em E e do nome completo em F. O importador V9 já persiste o valor em
`gradebook.turma.turno`; não há novo cadastro de turnos nem mudança de importador.
A view privada `student_portal.academic_class_v1` normaliza espaços externos e
caixa para `MATUTINO`, `VESPERTINO` e `NOTURNO`. Valor desconhecido não cria turno.
O catálogo administrativo inclui somente turnos com turmas no ano do Portal.

Para cada campo de política, a prioridade é **Aluno > Turno > Turma > Escola**.
Uma regra própria do turno suspende a regra da turma no mesmo campo, sem apagá-la.
Ao remover a regra do turno, a regra da turma volta a valer. `false` e `[]` são
escolhas explícitas, não ausência de regra. Objetos de calendário e risco continuam
atômicos. Regras individuais de aluno permanecem acima de turma e turno.

O nível turno aceita todos os campos de política existentes: acesso e agenda,
parciais, atualização automática, períodos, resultado final, relatório do
trimestre, forma conclusiva, risco e calendário. A barreira escolar de acesso,
elegibilidade, bloqueio individual e demais guardas de segurança continuam sendo
avaliadas pelo núcleo existente. Prioridade de configuração não remove guardas.

Uma reimportação da Relação muda o turno aplicável sem copiar configurações para
cada turma ou aluno. A regra acompanha o turno corrente, não um agrupamento salvo
no navegador. Regras de turno sem turma não são oferecidas para nova configuração;
a remoção de uma regra armazenada continua possível.

## Contratos e consumidores

`PolicyScopeV1` acrescenta `{ kind: 'shift', academicYear: 2026, shift }` aos
escopos de configuração, origem e auditoria. `ScopeV1` permanece restrito a escola,
turma e conta para operações de contas, sessões e publicação. A consulta V2
`shifts-read`, no escopo escola, retorna turnos, turmas e campos próprios necessários
aos avisos curtos do painel. Autorização administrativa e `no-store` permanecem.

Leituras individuais, leituras administrativas em lote, atualização automática e
inventário de personalizações usam a mesma prioridade. As listas não apresentam
regras de turma suspensas como diferenças ativas. A paginação selada aceita chaves
de turno. Alterações continuam usando CAS, idempotência, auditoria, epoch escolar
e invalidação existentes; não há canal de eventos, job ou serviço novo por turno.

A liberação de notas por turno controla a visibilidade por política, inclusive
agendamentos. A decisão de publicação da fonte continua nos escopos já existentes;
esta extensão não cria uma segunda autoridade sobre notas.

## Migration e publicação futura

`0022_shift_policy_v1.sql` cria a view privada, estende a restrição dos escopos de
configuração e alinha `pin_publication_auto_approval_v2()` à prioridade de turno.
O ponteiro de atualização automática conserva a última edição aprovada ao desligar
a atualização; um turno com atualização desativada impede promoção por regra de
turma ou escola. Nenhuma nota ou regra de turma é reescrita pela migration.

A migration deve ser aplicada **antes do Worker que consulta a nova view**, com
o procedimento oficial e a autorização de banco aplicável. Sem regras de turno,
o servidor anterior conserva sua resolução. Não gravar regras de turno enquanto
servidores anteriores ainda estiverem atendendo. Depois de existirem essas regras,
reverter apenas o código para uma versão que não entende turno é inseguro.

Antes de envio e publicação: registrar issue de contrato e PR, revisar a árvore
final, passar os gates, conferir a base atual, aplicar a migration e usar o deploy
oficial na ordem compatível. Registrar separadamente a execução e verificação da
publicação. Validação real com o responsável permanece separada dos testes locais.
