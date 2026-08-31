# Contrato da fonte — planilhas de notas

**Estado:** estrutura TypeScript V1, validação sintética e manifesto SHA-256 no fluxo real integrados pelas issues #193, #198 e #199. O contrato está disponível para consumidores; a execução controlada com o corpus real continua como gate de confiança antes do fechamento definitivo da F1.

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

A interface nunca converte ausência em zero. `Não lançada`, `não aplicável`, zero real e campo inexistente são estados diferentes.

A função `src/gradebook-domain/source/interpret-source-cell.ts`, integrada pela #201, materializa essa semântica em código puro e determinístico.

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

Cada lançamento futuro deve apontar para arquivo/hash/guia/célula, fórmula, valor em cache, valor bruto e valor semântico.

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

Comportamento:

- progresso diferencia `preparing` e `recognizing`;
- falha de leitura/hash/reconhecimento não cancela os demais arquivos;
- manifesto permanece disponível quando a falha ocorre após o hash;
- SHA-256 abreviado é exibido e o valor completo pode ser expandido;
- nenhum caminho local é exibido ou persistido;
- nenhum byte é enviado ao servidor nesta etapa;
- o arquivo original permanece inalterado.

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

As portas da #219 representam essa separação. O planejamento idempotente será implementado pela #228; a persistência física dependerá do schema/adaptador D1.

## Implementação e testes integrados

- Contrato da fonte: `shared/gradebook-contracts/source/source-contract-v1.ts`.
- Contrato do manifesto/lote: `shared/gradebook-contracts/imports/import-contract-v1.ts`.
- Manifesto runtime: `src/features/gradebook/import/file-manifest.ts`.
- Orquestração: `src/features/gradebook/import/import-batch.ts`.
- Testes básicos: `tests/gradebook/source-contract/source-contract-v1.test.ts`.
- Massa sintética: `tests/gradebook/fixtures/synthetic-teacher-workbooks.ts`.
- Testes ampliados da fonte/importação: `tests/gradebook/source/**` e `tests/gradebook/import/**`.
- Testes do manifesto: `tests/gradebook/import-manifest/import-manifest.test.ts`.
- Protocolo privado: `docs/gradebook/REAL_DATA_VALIDATION.md`.
- Integrações: #193/PR #207, #198/PR #213 e #199/PR #225.

A massa sintética cobre D1, D2, D3, VG, 1º, 2º, 3º, REC, tipos especiais de célula, atividades não aplicáveis, `J1` divergente, posições históricas, movimentações, lotes de 1/20/50 arquivos, SHA-256 e falha isolada.

As fixtures são objetos de workbook em memória. Elas não substituem a conferência de serialização binária, macros, cache real de fórmulas ou metadados nativos de proteção/ocultação. Esses pontos permanecem no protocolo controlado.

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

Não reproduzir fórmulas, nomes definidos, ActiveX ou guias como arquitetura web. Reproduzir regras, dados, rastreabilidade e fluxos funcionais.

## Estado dos critérios de confiança

- [x] Testes sintéticos cobrindo os tipos de célula aplicáveis.
- [x] D1 e D2 validados sinteticamente, com fixture representativa de D3.
- [x] SHA-256 e manifesto integrados no fluxo real do importador.
- [x] REC e movimentações cobertas pela massa sintética.
- [x] Falha individual e lotes de 1/20/50 arquivos cobertos.
- [x] Nenhum dado pessoal real versionado.
- [ ] Execução registrada do protocolo com as planilhas reais no commit vigente.
- [ ] Smoke manual autenticado da interface de manifesto/hash com arquivo selecionado no site oficial.

Os itens pendentes não bloqueiam contratos, motor, schema D1 ou planejamento de reimportação, mas bloqueiam declarar a F1 definitivamente validada em ambiente real.
