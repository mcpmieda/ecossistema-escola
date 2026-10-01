# Contagens reutilizáveis — #1221

O ADM mantém a regra de selos do Portal como autoridade. A otimização guarda somente
o total derivado por conta no PostgreSQL existente, sem criar um segundo motor
acadêmico, serviço de cache ou tarefa periódica.

## Leitura e validade

- O cliente solicita explicitamente até 400 contas selecionadas na lista por chamada.
  As consultas antigas por conta e turma continuam disponíveis. A navegação da lista
  permanece em páginas de 400; classificações globais precisam ler todas as páginas.
- O servidor autentica o administrador e verifica conta, vínculo, política e relógio
  dentro do mesmo snapshot somente leitura. O cache não concede acesso.
- A chave inclui versões acadêmicas, de vínculos, publicação, política, conta e da
  própria implementação, além das decisões temporais dos helpers canônicos. Uma
  mudança de calendário invalida o resultado mesmo sem atualização periódica.
- Um acerto evita carregar edições acadêmicas e reconstruir o Self do aluno. Uma
  ausência ou chave divergente executa o cálculo canônico. `null` continua diferente
  de zero. A escrita derivada ocorre depois do snapshot e sua falha não impede a
  resposta calculada. Falhas reais de leitura do banco continuam sujeitas ao
  tratamento de indisponibilidade existente.
- A tabela privada usa RLS e acesso restrito ao papel da aplicação. Mantém uma linha
  por conta, removida em cascata com a conta. Não armazena nomes, notas ou boletins.

A invalidação é conservadora: mudanças acadêmicas podem invalidar resultados de
outras contas. Isso favorece a correção e mantém uma implementação pequena; medir
a proporção de acertos antes de justificar uma invalidação mais granular.

## Custo e limites

Não existe custo computacional zero: continuam existindo consultas leves de
validação e, após mudanças, recálculo e gravação do total. O ganho concreto é deixar
de repetir projeções e transferir seus payloads em leituras válidas subsequentes.
Não há novo serviço pago nem aquecimento recorrente de contas que ninguém consulta.
O primeiro acesso sem resultado válido ainda pode levar mais tempo. A latência
também depende da rede e da disponibilidade do banco; não prometer tempo absoluto.

O navegador conserva apenas memória da tela, com deduplicação e duas requisições
simultâneas no máximo. Atualizações de dados invalidam essa memória. Nada é salvo
em armazenamento persistente do navegador.

## Banco de Notas

O dashboard de Desempenho reutiliza a análise atual já produzida pela comparação
entre trimestres: duas análises completas em vez de três. Analytics agrupa os pares
por aluno, oferta e professor em uma passagem, evitando varreduras repetidas. São
reutilizações dentro da mesma resposta e snapshot, sem persistir resultados
acadêmicos nem alterar fórmulas, grupos vazios ou ordenação.

## Pesquisa e escolha

- [Microsoft — Cache-Aside](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside):
  carregar sob demanda e tratar a invalidação explicitamente. Aqui, as versões e
  decisões temporais validam cada leitura no banco.
- [Amazon Builders’ Library — Caching challenges and strategies](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/):
  avaliar acertos, consistência e comportamento com cache frio; evitar depender
  exclusivamente de uma estimativa otimista de acertos.
- [PostgreSQL 17 — REFRESH MATERIALIZED VIEW](https://www.postgresql.org/docs/17/sql-refreshmaterializedview.html):
  refresh substitui o conteúdo da view. Não foi escolhido para reconstruir todos
  os alunos periodicamente, nem para duplicar a regra acadêmica em SQL.
- [PostgreSQL 17 — INSERT](https://www.postgresql.org/docs/17/sql-insert.html):
  `ON CONFLICT` permite atualizar a linha derivada com condição contra gravação
  atrasada, sem escrever novamente um resultado idêntico.
- [Supabase — Query optimization](https://supabase.com/docs/guides/database/query-optimization)
  e [PostgreSQL — EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html):
  verificar planos e trabalho real antes de adicionar índices; tempo de uma consulta
  isolada não representa toda a latência percebida pelo usuário.

## Validação

As regressões do pacote cobrem limites do contrato, lotes do cliente, equivalência
com Self, acertos/ausências, invalidação e privacidade. O teste PostgreSQL nativo
usa o driver com `fetch_types: false`, como a aplicação. CI e publicação devem ser
registrados na issue com o SHA final; aprovação de testes não é homologação de uso.
