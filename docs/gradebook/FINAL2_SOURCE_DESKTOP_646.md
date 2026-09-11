# Fonte, ano global e composição desktop — #646 / PR #647

## Base, autoridade e escopo

A entrega parte da `main` `f580ce6523a453db6a9b99612104a12a3ef66ead`, já contendo a PR #645 e o deploy 258 (`34519288361`). O estado factual de integração e publicação deve ser confirmado na PR #647 e na issue #646; este documento descreve o contrato do código, não prova merge, deploy, aceite visual ou homologação acadêmica.

O escopo é de leitura, apresentação e normalização de metadados da fonte. Não há DDL, DML acadêmico produtivo, mudança de fórmula, resultado anual, autoridade oficial, decisão humana do Conselho ou nova dependência. Desempenho continua identificado como `calculated-preview`.

## Evidência de instrumentos qualitativos

Nos slots qualitativos 11–20, cabeçalho vazio ou igual ao ordinal impresso da coluna (`1`…`10`, com parte decimal zero opcional) não cria atividade quando também não existe máximo nem nota salva em qualquer aluno. O importador normaliza apenas esse metadado sem significado; preserva slot, valores, deltas e histórico.

As leituras relacionais aplicam a mesma fronteira sem apagar linhas antigas. Um instrumento continua ativo quando é quantitativo, possui máximo, tem descrição significativa ou possui qualquer nota persistida. Zero persistido é evidência. A decisão considera o instrumento inteiro, não apenas o aluno aberto, de modo que uma coluna real não desaparece para colegas sem lançamento.

## Siglas observadas na fonte

O catálogo de apresentação foi transcrito de `CONFIGURAÇÃO`/`CONFIGURAÇÕES!H3:I16`: P, M, H, G, C, A, RL, RD, F, ET, I e CT para os componentes explicitamente encontrados. A normalização aceita caixa, espaços e acentos; componente ausente do catálogo recebe `null`, nunca abreviação inventada. Sigla não participa da identidade acadêmica.

## Um ano para o Banco inteiro

`GradebookYearProvider` mantém uma única seleção numérica para Centrais, Auditoria, Desempenho, Boletins, Relatórios e Conselho. O catálogo carrega automaticamente ao entrar em qualquer dessas áreas; Importação fica fora porque o ano reconhecido no arquivo não pode ser reinterpretado pela navegação.

O padrão é a preferência da aba somente quando ela ainda existe no catálogo; caso contrário, usa o maior ano realmente cadastrado. A preferência em `sessionStorage` contém apenas o número do ano, nunca catálogo, nota ou payload acadêmico. Seleção inexistente é recusada.

Uma troca incrementa o `epoch` e remonta todos os consumidores visitados, cancelando ou tornando inalcançáveis respostas anteriores. Consumidores V1 com IDs opacos só são ligados quando seu catálogo contém uma correspondência única cujo rótulo é exatamente o ano global. Ausência ou ambiguidade fecha a área sem aproximar para outro ano. Diagnósticos de importação recebem o filtro numérico `ano`; Boletins, Relatórios, Conselho e Auditoria antiga continuam usando seus contratos próprios depois desse mapeamento estrito.

## Detalhe e composição desktop

O detalhe prioriza avatar genérico, nome, nome completo da turma, componente, professor e data de leitura. Exibe apenas trimestres com lançamentos, destaca a nota trimestral e preserva zero, parcial, indisponível, N/C e REC conforme o núcleo. Recuperação paralela e REC final são sinais independentes fornecidos pelo motor; a interface não recalcula elegibilidade nem progressão anual.

A matriz é o centro da página. Controles ficam compactos e horizontais quando há largura; as quatro lentes compartilham a mesma grade, HeroUI Tabs segue `ListContainer`/`List`/`Tab`/`Panel`, e o gráfico é um filtro investigável da população já retornada. A validação visual final em navegador e ambiente autenticado foi adiada por solicitação do responsável e não é declarada concluída aqui.

## Limites residuais da FINAL-2

A projeção relacional atual não expõe perfil/versionamento nem uma semântica oficial de normalização entre períodos. Por isso `comparison.available` permanece `false` com `comparability-not-contracted`; o contrato histórico de comparação V2 não é aplicado por analogia. Também não foram inventados limiar de tendência, personalização visual ou política de abertura padrão.

Esses itens exigem decisão/contrato explícito ou validação visual posterior. Os sinais descritivos já contratados — abaixo da referência, incompleto, N/C, sem máximo, denominadores, média e mediana proporcionais — continuam apenas investigativos e não alteram estado acadêmico.

## Verificação

As regressões cobrem ordinais vazios, máximo, zero, evidência em outro aluno, catálogo de siglas, mapeamento anual único, padrão pelo catálogo, cancelamento de resposta antiga, independência entre paralela e REC final, contratos/transportes, SQL relacional e jornada React. O gate de entrega continua `npm run verify`, seguido pela CI no head final, revisão do diff e publicação oficial conforme BN-DEC-023.
