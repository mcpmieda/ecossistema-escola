# Configurações e reset anual — #688

## Resultado funcional

A área Configurações usa o mesmo shell e o mesmo ano global do Banco de Notas. `Resetar o sistema` limpa um único ano materializado e deixa o produto pronto para que a Relação desse ano seja importada novamente. O reset não cria ano, não compara anos, não reinicia IDs e não modifica a planilha original.

`vinculo.situacao = NULL` continua sendo o estado relacional regular. Na matriz de Desempenho ele aparece como `Em curso`; nenhum valor novo é escrito no banco.

## Protocolo de segurança

1. `preview` abre uma transação `REPEATABLE READ, READ ONLY` e conta todos os registros atribuíveis ao ano nas 30 relações atuais.
2. O servidor deriva uma revisão SHA-256 do contrato, ano e contagens e devolve a frase exata `RESETAR <ano>`.
3. A interface exige a frase e uma confirmação separada de irreversibilidade.
4. `execute` abre transação `SERIALIZABLE`, bloqueia as 30 relações contra escrita concorrente, refaz a prévia e rejeita qualquer revisão divergente.
5. As exclusões seguem a ordem das FKs. O serviço confere que a soma apagada coincide com a prévia e que nenhuma linha atribuível restou antes do commit.
6. Qualquer exceção reverte a transação. O retorno/log operacional registra somente ano e contagem, sem nomes, notas, hashes ou payloads.

Diagnósticos com `ano IS NULL` ficam preservados, pois não existe evidência segura para atribuí-los ao ano escolhido. Sequências também ficam: uma nova importação recebe IDs novos e não recicla identidade antiga.

## Escopo apagado

- configuração do ano, alunos, turmas, professores e disciplinas;
- vínculos, ofertas, instrumentos, notas e fechamentos;
- importações, diagnósticos atuais e trilha humana;
- decisões legadas, sessões, votos, comandos, fechamentos e fotografias do Conselho;
- snapshots de boletim;
- todos os históricos alcançáveis por ano/aluno/turma/oferta/instrumento/importação.

O próprio `ano_letivo` é removido no fim. Por isso o bootstrap deixa de oferecê-lo imediatamente e a Relação é o único caminho para materializá-lo outra vez.

## HTTP, permissões e limites

`POST /api/gradebook/year-reset` exige origem oficial, sessão autenticada, `gradebook.persistence.admin`, PostgreSQL selecionado, gate produtivo e `Cache-Control: no-store`. O body máximo é 2 KiB e os schemas são estritos.

As tabelas centrais já admitiam `DELETE` pela role backend. A `0008_year_reset_acl_v1.sql` acrescenta somente esse verbo às dez relações criadas depois com ACL append-only. Nenhuma role de navegador recebe `USAGE` ou privilégio de tabela. A migration não executa DML nem modifica schema, sequência ou regra acadêmica.

## Evidência e limite operacional

Os testes PostgreSQL descartáveis sem PII semeiam dois anos e todas as 30 relações. Eles demonstram prévia, conflito por mudança, rollback depois de falha injetada, exclusão integral de um ano, preservação exata do outro e nova materialização posterior.

Não existe backup gerenciado/RPO/RTO contratado. A UI declara essa limitação. Deploy e smoke não executam o botão final em produção; uma exclusão real só ocorre depois da confirmação explícita do operador na própria tela.
