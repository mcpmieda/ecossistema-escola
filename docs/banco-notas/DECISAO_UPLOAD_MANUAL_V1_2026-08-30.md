# Banco de Notas — decisão de produto: Upload Manual V1

Data da decisão: 30/08/2026

Responsável pela decisão: direção da Escola IEDA

Estado: **aprovado para implementação**

## Decisão em linguagem direta

Por enquanto, o Banco de Notas não dependerá de suplemento no Excel nem de sincronização automática por célula.

O fluxo operacional inicial será:

1. o professor continua trabalhando na planilha que já usa;
2. a Secretaria ou outro operador autorizado salva uma cópia em `.xlsx` quando o arquivo de origem for `.xlsb`;
3. o operador entra no Banco de Notas e faz upload manual dessa cópia;
4. o Banco calcula o hash, identifica duplicidade, valida a estrutura e lê as turmas, componentes, estudantes e campos de nota;
5. o resultado fica disponível para consulta no próprio Banco, com origem, guia e célula preservadas;
6. um novo upload do mesmo professor substitui a visão corrente somente por promoção explícita e mantém o lote anterior no histórico.

O arquivo original não é alterado pelo Banco.

## Motivo do pivot

O suplemento foi implantado e apareceu corretamente no Excel Online, mas o broker de autenticação NAA não concluiu a obtenção do token no contexto real observado. A falha permaneceu igual tanto na distribuição central quanto no manifesto carregado localmente. O console indicou bloqueio de execução `about:blank` no sandbox do Excel, sem erro MSAL suficientemente específico para justificar novas alterações por tentativa.

O caminho automático continua tecnicamente possível no futuro, mas não é requisito desta primeira entrega operacional. O upload manual remove a dependência do broker do Excel e preserva o backend, a autorização administrativa, o D1 e o modelo de auditoria já construídos.

## Escopo da primeira versão

Incluído:

- nova área administrativa `Importações` no Banco de Notas;
- upload de uma cópia `.xlsx` de até o limite seguro definido pela API;
- seleção de ano letivo, professor, fonte e perfil de leitura;
- hash SHA-256 calculado no servidor;
- idempotência por fonte + conteúdo;
- análise OOXML sem executar macros, fórmulas, links ou código do arquivo;
- leitura baseada em perfil versionado;
- identidade do estudante baseada na posição institucional da turma, nunca em nome aproximado;
- resumo do lote e consulta de turmas, componentes, estudantes e campos de nota lidos;
- distinção entre ausência, zero numérico e texto;
- histórico de uploads, findings e proveniência;
- arquivos reais fora do Git e conteúdo binário não persistido no D1;
- autorização por `grades.import.run` aplicada no servidor.

Fora do escopo desta versão:

- suplemento obrigatório;
- autenticação dentro do Excel;
- detecção em tempo real de célula;
- Graph como mecanismo automático de captura;
- execução de macros ou Excel COM no Cloudflare;
- leitura direta de `.xlsb` no runtime;
- inferência de estudante por nome;
- escolha automática entre duas fontes concorrentes;
- escrita de notas sem revisão/promoção explícita do lote;
- alteração do arquivo original do professor.

## Compatibilidade dos arquivos

### `.xlsx`

É o formato aceito pelo fluxo online. O parser lê diretamente as partes OOXML necessárias e rejeita pacotes fora dos limites ou com conteúdo perigoso.

### `.xlsb`

Os arquivos atuais podem continuar sendo usados pelos professores. Para upload, o operador deve usar no Excel:

`Arquivo → Salvar uma cópia → Pasta de Trabalho do Excel (*.xlsx)`

A cópia é usada somente para leitura. O `.xlsb` original permanece onde está e continua sendo o arquivo de trabalho do professor.

## Identidade dos estudantes

O Banco não deve inventar código de aluno nem usar comparação aproximada de nome.

O vínculo canônico é:

`ano letivo + turma + número sequencial do estudante`

O nome é apresentado para conferência humana, mas não é a chave de identidade. Quando a planilha contém os nomes definidos institucionais `RELACAOTURMA*` e `SITUACAOTURMA*`, eles podem servir como fonte de roster e situação, desde que o perfil versionado prove o intervalo e a posição. A guia `Vínculo Notas` é a referência estrutural preferencial porque é o mesmo padrão utilizado pelas planilhas dos professores.

## Regras de promoção

O upload e a análise não alteram automaticamente os snapshots acadêmicos.

Um lote somente passa a alimentar a visão oficial depois de:

1. análise concluída;
2. ausência de blockers;
3. conferência da turma, componente, quantidade de estudantes e posições;
4. correspondência exata com o relacionamento institucional do mesmo ano;
5. promoção explícita por operador autorizado;
6. transação atômica e idempotente no D1.

Repetir exatamente o mesmo arquivo retorna o mesmo efeito lógico. Um arquivo diferente cria nova versão e não apaga a anterior.

## Estado do suplemento

O add-in já distribuído para a coorte de teste não será usado como caminho de produção nesta versão. As flags globais de sincronização e commit devem permanecer desligadas. A distribuição pode ser removida em mudança separada e controlada; não é necessário removê-la para implementar o upload manual, porque sem ação do usuário e com as flags desligadas ela não produz escrita acadêmica.

## Critério de conclusão

A primeira versão é considerada pronta quando um operador autorizado consegue, sem terminal:

1. escolher professor, ano e fonte; o perfil institucional é aplicado automaticamente;
2. selecionar uma cópia `.xlsx`;
3. enviar uma única vez;
4. receber um resultado claro de sucesso, duplicidade ou erro estrutural;
5. abrir o lote e conferir o que o Banco leu;
6. consultar o conteúdo sem que o arquivo original tenha sido alterado;
7. repetir o mesmo upload sem duplicar efeito;
8. confirmar por evidência D1 que o suplemento e a rota de commit continuam desligados.
