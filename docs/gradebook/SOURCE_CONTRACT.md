# Contrato da fonte — planilhas de notas

**Estado:** `SourceContractV1` permanece histórico e interpretável sob a semântica que produziu a validação F1 7/7 da #184. A #365 introduziu `SourceContractV2` para corrigir, de forma prospectiva e explícita, a modelagem dos cabeçalhos de avaliações trimestrais descoberta depois daquela validação. A #366 implementou o consumo ponta a ponta e a #367 integrou/revalidou a onda antes do retorno aos gates manuais F9.

Esta evolução não reabre nem reescreve retroativamente a evidência histórica da F1. Também não autoriza D1 produtivo, migration remota, piloto real ou mudança de `authorityMode`.

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

### Metadados e estudantes

| Informação | Local |
|---|---|
| Quantidade declarada de alunos | `J1` |
| Disciplina | `K2` |
| Turma | `K3` |
| Trimestre | `K4` |
| Situação do aluno | coluna `G` |
| Número do aluno | coluna `J` |
| Nome do aluno | coluna `K` |

### Trimestres regulares — definições e valores

As linhas de estudante continuam começando em **5**. Cabeçalhos e lançamentos possuem naturezas diferentes e não podem ser confundidos.

| Informação | Definição/cabeçalho | Valor do estudante |
|---|---|---|
| Avaliação quantitativa 1 | `R3` = máximo/configuração | `R5:R...` |
| Avaliação quantitativa 2 | `S3` = máximo/configuração | `S5:S...` |
| Atividade qualitativa AA | `AA3` = máximo/configuração; `AA4` = nome livre | `AA5:AA...` |
| Atividades qualitativas seguintes | mesmo padrão em `AB:AJ` | linhas `5+` no mesmo slot |
| Total quantitativo importado | — | coluna `T` |
| Avaliação/recuperação paralela importada | — | coluna `Z` |
| Total qualitativo importado | — | coluna `AK` |
| Nota oficial trimestral importada | — | coluna `AM` |
| Acumulado anual importado | — | coluna `AN` |

### Quantitativo R/S

- `R` e `S` são **slots estruturais**, não classificações pedagógicas.
- Os nomes seguros no sistema são `Avaliação quantitativa 1` e `Avaliação quantitativa 2`.
- A posição `S` não autoriza `simulation`/`simulado`; a posição `R` não autoriza uma classificação mais específica.
- Uma eventual classificação pedagógica futura exige evidência, metadado ou regra institucional explícita e versionada.
- `R3`/`S3` nunca são lançamentos de estudante.

### Qualitativo AA:AJ

- `AA3:AJ3` preserva a configuração bruta de máximo de cada slot.
- `AA4:AJ4` preserva o texto livre informado pelo professor, inclusive Unicode, acentuação e nomes longos.
- `AA5:AJ...` contém os lançamentos individuais dos estudantes.
- O máximo/configuração da linha 3 pode ser número, vazio ou `*`.
- Vazio ou `*` é ambíguo: pode representar atividade não aplicada ou ainda não configurada. Sem outro sinal oficial inequívoco, o estado é `insufficient-data`.
- Vazio/`*` não vira `not-applicable` por heurística e nunca recebe `maximum = 0` artificial.
- O nome livre é preservado mesmo quando o máximo estiver incompleto; isso não significa que um `AssessmentComponentV2` completo já possa ser materializado.

## Versionamento do contrato

### V1 — histórico

`shared/gradebook-contracts/source/source-contract-v1.ts` permanece imutável para interpretar artefatos/evidências produzidos sob V1. O helper histórico `isSourceQualitativeActivityApplicableV1(...)` não é a semântica prospectiva dos cabeçalhos V2.

Não converter nem reinterpretar snapshots, registros ou validações V1 como se tivessem sido produzidos pelo conhecimento posterior da #365.

### V2 — prospectivo

`shared/gradebook-contracts/source/source-contract-v2.ts` formaliza:

- `R3` e `S3` como máximo/configuração das avaliações quantitativas 1 e 2;
- `R/S` linhas `5+` como valores dos estudantes;
- dez slots qualitativos `AA...AJ`, cada um com célula de máximo/configuração na linha 3, nome na linha 4 e valores a partir da linha 5;
- proveniência por célula para máximo/configuração e nome;
- estados brutos de máximo `numeric | ambiguous-empty | ambiguous-marker | missing-field | unrecognized`;
- resolução fail-closed: somente máximo numérico finito e positivo, junto das demais evidências suficientes, produz definição resolvida;
- `not-applicable` somente mediante evidência explícita suficiente; os sinais atualmente conhecidos vazio/`*` não são suficientes;
- preservação dos agregados oficiais `T`, `Z`, `AK`, `AM` e `AN`, sem recomposição a partir dos slots.

## Identidade estável da definição de avaliação

Nome e máximo são atributos versionáveis, não identidade.

A chave estrutural V2 considera:

1. referência da fonte lógica confirmada;
2. ano acadêmico explícito;
3. `teachingAssignmentId` resolvido — que já fixa professor, turma e componente no ano;
4. trimestre;
5. slot estrutural de origem (`R`, `S`, `AA`...`AJ`).

O identificador acadêmico exposto continua opaco. A referência física do slot serve à identidade/proveniência interna e não vira identidade acadêmica pública.

Consequências:

- renomear a atividade no mesmo slot não cria outra identidade estrutural;
- alterar o máximo no mesmo slot não cria outra identidade estrutural;
- essas mudanças podem produzir nova versão da mesma definição quando a implementação/reconciliação assim determinar;
- omissão ou ambiguidade em uma reimportação não apaga automaticamente versões anteriores;
- nomes idênticos em slots/contextos diferentes não colidem.

## Campos importados que permanecem autoritativos

A granularidade V2 não cria fórmula para os agregados já importados:

- `T` = total quantitativo;
- `Z` = avaliação/recuperação paralela conforme contrato vigente;
- `AK` = total qualitativo;
- `AM` = nota oficial do trimestre;
- `AN` = acumulado anual.

É proibido, nesta evolução, recalcular `T` por R/S, recalcular `AK` por AA:AJ, alterar `AM`/`AN`, inferir pesos, percentuais, médias, rankings, materialidade ou tolerâncias.

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
| Flag de REC do 1º trimestre | `AC` |
| Flag de REC do 2º trimestre | `AD` |
| Flag de REC do 3º trimestre | `AE` |

A recuperação final substitui a nota do trimestre aplicável no total pós-REC, mesmo quando for menor. O valor anterior permanece no histórico. A #365 não altera essa regra.

### Flags AC/AD/AE no transporte V3

O histórico contratual e a fixture sintética original de REC distinguem explicitamente `1`, `0` e
ausência: `1` significa recuperação aplicável ao trimestre; `0` significa explicitamente não aplicável.
O V3 preserva o valor bruto e sua classificação antes de resolver essa semântica. Vazio, campo ausente,
texto, booleano, fórmula ou número diferente de `0`/`1` são dados insuficientes e exigem revisão; nunca se
usa a regra genérica `valor !== 1 => not-applicable`.

A proveniência de uma flag válida é reconstruída server-side pelo manifesto/hash, guia, linha e coluna
estrutural AC/AD/AE. Uma observação inválida permanece no request sanitizado para diagnóstico, mas não
autoriza um `FinalRecoveryV1` como se fosse evidência resolvida.

Para o total anual original, T1/T2-AN são somente acumulados intermediários. Os candidatos finais são
T3-AN e REC-AB: igualdade preserva as duas evidências; divergência exige revisão; apenas um disponível é
aceito. U é observação direta do total pós-REC; sua ausência não transforma automaticamente o original
em pós-REC.

## Semântica das células de lançamento

| Origem | Tratamento |
|---|---|
| Vazia | ausência de lançamento |
| Campo inexistente | dado insuficiente/estrutura divergente, distinto de vazio |
| Número manual positivo | lançamento válido, sujeito à faixa |
| `0,1` manual | marcador institucional de zero oficial; preservar `0,1` na origem e interpretar como `0` em análises |
| Zero manual legado | zero real preservado e identificado como legado |
| Número manual negativo | lançamento preservado e ocorrência de Auditoria |
| Fórmula com resultado não zero | valor válido; preservar fórmula e cache |
| Fórmula com resultado zero | ausência de lançamento na regra vigente |
| Fórmula sem cache/erro | ocorrência de origem; não inventar valor |
| Texto em campo numérico | inválido, salvo regra explicitamente documentada |
| Não aplicável | excluído do cálculo correspondente, sem virar zero |

Essa tabela continua tratando células de **lançamento**. A classificação específica dos cabeçalhos de máximo/configuração V2 é separada para preservar vazio/`*` como ambiguidade documental.

A interface nunca converte ausência em zero. `Não lançada`, `não aplicável`, zero real e campo inexistente são estados diferentes.

A função `src/gradebook-domain/source/interpret-source-cell.ts`, integrada pela #201, materializa a semântica V1 de lançamentos em código puro e determinístico. O recognizer/materializador V2 integrado pela #366 preserva a mesma separação de estados sem reinterpretar V1.

## Estudantes e movimentações

- Todos os registros/posições da fonte são preservados.
- `J1` representa a quantidade declarada/vigente da guia, mas não apaga posições históricas encontradas.
- `FOI PARA XX` na origem e `ESTAVA NO XX` no destino representam movimento explícito dentro do ano.
- O destino é a posição vigente para o recorte atual; a origem permanece histórica.
- Notas anteriores replicadas no destino não podem causar dupla contagem.
- Não aplicar correspondência aproximada dentro do ano quando a própria fonte declarou a transferência.
- Marcas significativas no nome, inclusive ponto inicial usado para homônimos, devem ser preservadas.

## Identificação e proveniência do arquivo

Cada arquivo importado registra:

- ID técnico do manifesto;
- nome, extensão e MIME informado;
- tamanho e data de modificação;
- SHA-256 calculado localmente;
- versão do contrato da fonte e do parser;
- instante de leitura;
- ano e professor sugeridos/confirmados quando disponíveis;
- guias classificadas, auxiliares e não reconhecidas;
- diagnósticos por arquivo.

Cada lançamento e cada definição V2 devem manter a proveniência necessária para distinguir arquivo/hash/guia/célula e o valor bruto observado. O contrato V2 não transforma o nome do arquivo em identidade permanente.

## Fluxo runtime integrado pela #199

```text
Arquivo selecionado
      ↓
Leitura única em memória
      ↓
Preparação + SHA-256 por Web Crypto
      ↓
Criação do SourceFileManifestV1
      ↓
Yield para a interface
      ↓
Reconhecimento SheetJS
      ↓
Resultado ou diagnóstico isolado por arquivo
```

Comportamento vigente:

- progresso diferencia `preparing` e `recognizing`;
- falha de leitura/hash/reconhecimento não cancela os demais arquivos;
- manifesto permanece disponível quando a falha ocorre após o hash;
- SHA-256 abreviado é exibido e o valor completo pode ser expandido;
- nenhum caminho local é exibido ou persistido;
- nenhum byte é enviado ao servidor nesta etapa;
- o arquivo original permanece inalterado.

A #365 não alterou o recognizer/runtime. A #366 passou a ler os novos cabeçalhos antes do loop da linha 5 e a #367 congelou essa composição em regressão transversal.

## Identidade lógica e reimportação

O contrato distingue nome, hash e fonte lógica:

- nome é metadado observado;
- SHA-256 identifica bytes idênticos;
- mesmo hash com outro nome representa o mesmo conteúdo renomeado;
- hash diferente não decide sozinho que existe outra fonte lógica;
- ano, professor e contexto acadêmico compatíveis permitem sugerir continuidade, mas casos ambíguos exigem confirmação;
- salvar novamente a planilha pode mudar bytes sem mudar notas, portanto a comparação acadêmica sucede o hash;
- valores inalterados não devem gerar nova versão;
- valores novos/alterados geram versão e preservam a anterior;
- valores que desaparecem não são apagados silenciosamente.

A identidade estrutural das avaliações V2 segue a mesma política: fonte lógica e contexto resolvido precedem atributos mutáveis como nome e máximo.

## Implementação e testes

- Contrato histórico da fonte: `shared/gradebook-contracts/source/source-contract-v1.ts`.
- Contrato prospectivo das definições: `shared/gradebook-contracts/source/source-contract-v2.ts`.
- Contrato acadêmico V2 de componentes: `shared/gradebook-contracts/results/results-contract-v2.ts`.
- Testes V1 históricos: `tests/gradebook/source-contract/source-contract-v1.test.ts`.
- Testes V2: `tests/gradebook/source-contract/source-contract-v2.test.ts` e `tests/gradebook/result-contracts/results-contract-v2.test.ts`.
- Contrato do manifesto/lote: `shared/gradebook-contracts/imports/import-contract-v1.ts`.
- Transporte de persistência V3: `shared/gradebook-contracts/imports/import-persistence-transport-v3.ts`.
- Manifesto runtime: `src/features/gradebook/import/file-manifest.ts`.
- Orquestração vigente: `src/features/gradebook/import/import-batch.ts`.
- Massa sintética vigente: `tests/gradebook/fixtures/synthetic-teacher-workbooks.ts`.
- Recognizer V2: `src/features/gradebook/import/spreadsheet-recognizer.ts`.
- Materialização V2: `src/features/gradebook/import/assessment-definition-materializer-v2.ts`.
- Reconciliação V2 sobre o planejador/executor oficial: `server/gradebook/application/import/assessment-import-reconciliation-v2.ts`.
- Projeções provider-independent de Term/REC/Annual: `server/gradebook/application/import/academic-result-projection-v1.ts`.
- Regressão transversal: `tests/gradebook/integration/wave-21-assessment-fidelity-integration.test.ts`.
- Protocolo privado histórico F1: `docs/gradebook/REAL_DATA_VALIDATION.md`.

A massa sintética foi ampliada pela #366 exclusivamente com dados sintéticos. #365–#367 não leram arquivo real.

## Banco central XLSB como referência funcional

A aplicação Excel de referência contém configuração, relação, vínculo de notas, base de controle, aproveitamento, boletim, ficha do aluno, Conselho e ata/resultados. No sistema novo:

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

Não reproduzir fórmulas, nomes definidos, ActiveX ou guias como arquitetura web. Reproduzir regras, dados, rastreabilidade e fluxos funcionais.

## Estado dos critérios de confiança

A F1/#184 permanece **historicamente concluída 7/7** segundo o contrato e o protocolo então vigentes. A descoberta da #365 é uma correção de modelagem posterior e não invalida retroativamente esse resultado.

A onda 21 pré-piloto foi integrada na sequência obrigatória:

```text
#365 contrato V2 verde / PR #368
  → #366 implementação ponta a ponta sobre V2 / PR #369
  → #367 integração + nova regressão de readiness
  → gates manuais F9 próprios
```

Após a #367, nenhum piloto real, D1 acadêmico produtivo, migration remota, smoke acadêmico produtivo ou ativação de `native-engine` é automático. Cada ação continua exigindo autorização própria.
