# Protocolo de validação controlada com planilhas reais

## Objetivo e limite de segurança

Este protocolo compara o leitor integrado do Banco de Notas com planilhas reais mantidas fora do Git. Ele não autoriza copiar, renomear, anexar ou publicar os arquivos usados na validação.

O relatório público contém somente contagens, percentuais e categorias agregadas. Nunca publicar caminho local, nome de arquivo, hash, nome de professor ou estudante, número de matrícula, nota, fórmula, conteúdo de célula, data de modificação ou screenshot com dados reais.

## Local privado

O corpus deve permanecer em um diretório com acesso restrito, fora do clone e fora de qualquer pasta sincronizada ou rastreada pelo Git. Nos comandos abaixo, substituir apenas localmente:

```powershell
$gradebookPrivateCorpus = '<DIRETORIO_PRIVADO_FORA_DO_REPOSITORIO>'
if (-not (Test-Path -LiteralPath $gradebookPrivateCorpus)) {
  throw 'O diretório privado de validação não foi encontrado.'
}
```

O valor real dessa variável não deve aparecer em issue, PR, log compartilhado ou documento versionado.

## Preparação reproduzível

Na raiz do repositório:

```powershell
npm ci
npm test -- tests/gradebook/source tests/gradebook/import
npm run verify
```

Calcular os hashes somente para comparação local antes/depois. Não copiar hashes ou caminhos para o relatório público:

```powershell
$gradebookBefore = @{}
Get-ChildItem -LiteralPath $gradebookPrivateCorpus -File -Recurse |
  Where-Object { $_.Extension -in '.xlsb', '.xlsx', '.xls' } |
  Get-FileHash -Algorithm SHA256 |
  ForEach-Object { $gradebookBefore[$_.Path] = $_.Hash }

if ($gradebookBefore.Count -eq 0) {
  throw 'Nenhuma planilha de formato aceito foi encontrada no corpus privado.'
}
```

Iniciar o site localmente:

```powershell
npm run dev -- --host 127.0.0.1
```

Abrir `http://127.0.0.1:5173/#/banco-de-notas`. A seleção de arquivos é manual e local; nenhum arquivo deve ser movido para o repositório.

## Amostragem estratificada

A amostra deve cobrir, quando existirem no corpus autorizado:

1. cada formato disponível: XLSB, XLSX e XLS;
2. D1 sem sufixo, D2 e uma ocorrência representativa de D3;
3. guias VG, 1º, 2º, 3º e REC;
4. células vazias, `0,1`, zero legado, número positivo, negativo, fórmula não zero, fórmula zero, fórmula sem cache/erro e texto inválido;
5. atividade `*`, atividade com máximo zero e atividade com nome longo;
6. divergência entre `J1` e posições históricas;
7. pelo menos um par `FOI PARA` / `ESTAVA NO` com notas replicadas;
8. guia protegida e guia oculta/auxiliar, quando existirem.

Se algum estrato não existir no corpus autorizado, registrar apenas `não disponível na amostra`, sem inventar dado e sem reduzir silenciosamente a cobertura declarada.

## Execução

1. Importar primeiro um arquivo de cada formato disponível e conferir as guias esperadas.
2. Importar lotes mistos de até 50 arquivos e confirmar ordem do progresso, sucesso/falha por arquivo e continuidade após falha individual.
3. Para cada estrato, comparar localmente as células confirmadas no contrato com a leitura exibida: `J1`, `K2`, `K3`, `K4`, `G`, `J`, `K`, `R`, `S`, `T`, `U`, `X`, `Y`, `Z`, `AA:AJ`, `AK`, `AM`, `AN`, `AB`, `AC`, `AD` e `AE`, conforme o tipo de guia.
4. Confirmar D1/D2/D3, REC, posições históricas, movimentações e ausência de conversão de vazio em zero.
5. Incluir deliberadamente no lote uma cópia local inválida ou arquivo não reconhecível sem dados pessoais; confirmar que a falha é individual e explicável.
6. Não editar, salvar, exportar ou substituir o arquivo original durante a validação.

Depois da leitura, repetir a comparação local de hashes sem imprimir os valores:

```powershell
$gradebookAfter = @{}
Get-ChildItem -LiteralPath $gradebookPrivateCorpus -File -Recurse |
  Where-Object { $_.Extension -in '.xlsb', '.xlsx', '.xls' } |
  Get-FileHash -Algorithm SHA256 |
  ForEach-Object { $gradebookAfter[$_.Path] = $_.Hash }

$gradebookChanged = $gradebookBefore.Count -ne $gradebookAfter.Count
foreach ($gradebookPath in $gradebookBefore.Keys) {
  if (-not $gradebookAfter.ContainsKey($gradebookPath) -or $gradebookBefore[$gradebookPath] -ne $gradebookAfter[$gradebookPath]) {
    $gradebookChanged = $true
  }
}

if ($gradebookChanged) {
  throw 'A validação detectou alteração no corpus privado; interrompa e investigue localmente.'
}
```

## Métricas agregadas permitidas

Registrar em arquivo local fora do repositório e publicar, quando necessário, somente:

| Métrica             | Forma pública permitida                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| Arquivos amostrados | contagem total e contagem por formato                                   |
| Resultado do lote   | contagem reconhecida, falha e taxa percentual                           |
| Guias               | esperadas/reconhecidas por VG, 1º, 2º, 3º, REC, D1, D2 e D3             |
| Células             | quantidade conferida e divergências por classificação sem valor bruto   |
| Atividades          | contagem aplicável, `*`, máximo zero e nome longo                       |
| Posições            | contagem declarada em `J1` e quantidade agregada de posições históricas |
| Movimentações       | pares conferidos e divergências agregadas                               |
| Recuperação         | guias/linhas conferidas e divergências agregadas                        |
| Proteção/ocultação  | quantidade lida por categoria                                           |
| Integridade         | quantidade de arquivos alterados, que deve ser zero                     |

Mensagens de falha devem ser reduzidas a categorias genéricas, por exemplo: `sem guia reconhecida`, `formato não suportado`, `célula divergente` ou `fórmula sem cache`. Não publicar a mensagem quando ela contiver conteúdo real.

## Sanitização antes de qualquer publicação

- substituir qualquer identificação por contagem agregada;
- remover nomes de arquivos e guias que contenham identificação;
- remover caminhos, hashes, horários, autores e metadados do sistema operacional;
- não publicar nota, fórmula, nome, matrícula, turma vinculada a pessoa ou screenshot;
- revisar manualmente texto, anexos e logs antes de comentar em issue/PR;
- quando houver divergência, criar uma reprodução sintética mínima antes de abrir correção pública;
- confirmar com `git status --short --untracked-files=all` que nenhum arquivo privado entrou no clone.

## Critério de resultado

A validação controlada é satisfatória quando:

- todas as guias/células esperadas da amostra são reconhecidas ou possuem divergência agregada e explicável;
- uma falha não cancela os demais arquivos do lote;
- o leitor não altera os arquivos, com zero mudanças na comparação local;
- nenhuma evidência identificável sai do ambiente privado;
- qualquer correção necessária nasce de fixture sintética, em issue própria, sem anexar a fonte real.

## Cobertura sintética e limitações

Os testes versionados cobrem `SRC-001` a `SRC-008`, `CELL-001` a `CELL-010`, `IMP-001` a `IMP-005`, `IMP-009`, `IMP-010`, `ID-001` a `ID-007` e `REC-001` a `REC-005` no comportamento aplicável ao leitor atual.

As fixtures são objetos de workbook em memória. Elas exercitam diretamente os módulos integrados, mas não reproduzem serialização binária, macros, particularidades do cache de fórmulas nem metadados nativos de proteção/ocultação de cada formato. Esses pontos são conferidos pelo procedimento real acima.

O leitor atual preserva as posições e marcadores `FOI PARA` / `ESTAVA NO`, mas não executa reconciliação de identidade nem deduplicação acadêmica; os testes não atribuem essa semântica ao importador. `IMP-006`, `IMP-007` e `IMP-008` dependem de manifesto/hash, persistência e histórico ainda fora deste escopo e não são simulados como se estivessem implementados.
