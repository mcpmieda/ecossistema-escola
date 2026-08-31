# Contrato da fonte — planilhas de notas

**Estado:** referência confirmada; deve virar `SourceContractV1` testável antes de ser considerado congelado.

## Escopo inicial

- Fonte operacional: arquivos anuais de notas dos professores.
- Formatos aceitos: XLSB, XLSX e XLS.
- Referência funcional: `BANCO DE NOTAS 2026.xlsb`.
- Fora do escopo inicial: SMECEL, outras fontes cadastrais, sincronização automática e planilha técnica padronizada.
- A importação é sempre somente leitura; macros não são executadas e proteções não são removidas.

## Organização dos arquivos de professores

Cada arquivo representa um professor e um ano letivo e pode conter várias turmas e disciplinas.

Padrão de guias:

```text
<turma>VG             visão geral
<turma>1º             primeiro trimestre
<turma>2º             segundo trimestre
<turma>3º             terceiro trimestre
<turma>REC            recuperação final
<turma><etapa>D2      segunda disciplina da turma no mesmo arquivo
<turma><etapa>D3...   disciplinas adicionais
RELAÇÃO               nomes e situações
CONFIGURAÇÃO          parâmetros e auxiliares
INICIO                 painel da planilha
```

O índice sem sufixo é tratado como `D1`; não inferir que o nome do arquivo define uma única disciplina.

## Células e colunas confirmadas

| Informação | Local |
|---|---|
| Quantidade declarada de alunos | `J1` |
| Disciplina | `K2` |
| Turma | `K3` |
| Trimestre | `K4` |
| Situação do aluno | coluna `G` |
| Número do aluno | coluna `J` |
| Nome do aluno | coluna `K` |
| Avaliação escrita | coluna `R` |
| Simulado/segunda avaliação | coluna `S` |
| Total quantitativo | coluna `T` |
| Avaliação paralela | coluna `Z` |
| Atividades qualitativas | colunas `AA:AJ` |
| Total qualitativo | coluna `AK` |
| Nota oficial do trimestre | coluna `AM` |
| Total anual/acumulado | coluna `AN` |

Os máximos vêm dos cabeçalhos. Uma atividade qualitativa é aplicável quando possui máximo maior que zero e nome diferente de `*`.

## Recuperação final

Nas guias `REC`:

| Informação | Local |
|---|---|
| Nota REC do 1º trimestre | `R` |
| Nota REC do 2º trimestre | `S` |
| Nota REC do 3º trimestre | `T` |
| Total anual pós-REC | `U` |
| Nota original do 1º trimestre | `X` |
| Nota original do 2º trimestre | `Y` |
| Nota original do 3º trimestre | `AA` |
| Total anual original | `AB` |
| REC aplicável ao 1º trimestre | `AC = 1` |
| REC aplicável ao 2º trimestre | `AD = 1` |
| REC aplicável ao 3º trimestre | `AE = 1` |

A recuperação final substitui a nota do trimestre aplicável no total pós-REC, mesmo quando for menor. O valor anterior permanece no histórico.

## Semântica das células

| Origem | Tratamento |
|---|---|
| Vazia | ausência de lançamento |
| Número manual positivo | lançamento válido, sujeito à faixa |
| `0,1` manual | marcador institucional de zero oficial; preservar `0,1` na origem e interpretar como `0` em análises |
| Zero manual legado | zero real preservado e identificado como legado |
| Número manual negativo | lançamento preservado e ocorrência de auditoria |
| Fórmula com resultado não zero | valor válido; preservar fórmula e cache |
| Fórmula com resultado zero | ausência de lançamento na regra vigente |
| Fórmula sem cache/erro | ocorrência de origem; não inventar valor |
| Texto em campo numérico | inválido, salvo regra explicitamente documentada |

A interface nunca converte ausência em zero. `Não lançada`, `não aplicável`, zero real e campo inexistente são estados diferentes.

## Estudantes e movimentações

- Todos os registros/posições da fonte são preservados.
- `J1` representa a quantidade declarada/vigente da guia, mas não apaga posições históricas encontradas.
- `FOI PARA XX` na origem e `ESTAVA NO XX` no destino representam movimento explícito dentro do ano.
- O destino é a posição vigente para o recorte atual; a origem permanece histórica.
- Notas anteriores replicadas no destino não podem causar dupla contagem.
- Não aplicar correspondência aproximada dentro do ano quando a própria fonte declarou a transferência.
- Marcas significativas no nome, inclusive ponto inicial usado para homônimos, devem ser preservadas.

## Identificação e proveniência

Cada arquivo importado deve registrar:

- nome, extensão, tamanho e data de modificação;
- SHA-256 calculado no cliente ou backend controlado;
- ano e professor sugeridos/confirmados;
- guias classificadas, não classificadas e auxiliares;
- versão do parser/contrato;
- lote, usuário e instante de leitura.

Cada lançamento deve apontar para arquivo/hash/guia/célula, fórmula, valor em cache, valor bruto e valor semântico.

## Banco central XLSB como referência funcional

A varredura do `BANCO DE NOTAS 2026.xlsb` mostrou uma aplicação Excel composta por configuração, relação, vínculo de notas, base de controle, aproveitamento, boletim, ficha do aluno, Conselho e ata/resultados. No sistema novo:

| Excel de referência | Responsabilidade nova |
|---|---|
| `CONFIGURAÇÕES` | perfil versionado e configurações |
| `RELAÇÃO` | estudantes, matrículas e situações |
| `VINCULO NOTAS` | importação/staging |
| `BASE DE CONTROLE` | modelo normalizado + motor nativo |
| `APROVEITAMENTO` | Desempenho |
| `FICHA ALUNO` | Central do Aluno |
| `BOLETIM` | Boletins |
| `CONSELHO` | Conselho de Classe |
| `ATA RESULTADOS` | relatórios/saídas do Conselho |
| `INICIO` | navegação e estado operacional |

Não reproduzir fórmulas, nomes definidos, ActiveX ou guias como arquitetura web. Reproduzir as regras, os dados, a rastreabilidade e os fluxos funcionais.

## Critério de congelamento do contrato V1

O contrato só será congelado depois de:

1. testes sintéticos cobrindo todos os tipos de célula;
2. validação de D1 e D2 e fixture representativa de D3;
3. comparação controlada com as planilhas reais disponíveis;
4. confirmação de REC e movimentações;
5. nenhum dado pessoal real versionado;
6. aprovação da issue de contrato pelo integrador.