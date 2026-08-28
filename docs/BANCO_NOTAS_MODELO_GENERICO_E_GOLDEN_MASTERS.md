# Banco de Notas — modelo genérico e golden masters privados

Data da decisão: 25/08/2026

Estado: decisão arquitetural obrigatória e bloqueadora de release.

## Decisão

O produto final possui um **modelo genérico limpo**, sem dados, nomes, estrutura ou configuração derivados de um professor específico. O processo de migração recebe uma planilha legada de qualquer professor, extrai sua semântica por contratos gerais e produz uma nova instância desse modelo, pronta para conexão com o Banco de Notas.

`NOTAS NINA 2026.xlsb`, `NOTAS ALANNA 2026.xlsb` e `Modelo_Professor_Nina_2026_Homologado.xlsx` são exclusivamente **golden masters privados de homologação**. Eles não são templates oficiais, não compõem o produto e não definem comportamento de produção.

## Limites obrigatórios

Os golden masters privados não podem ser:

- versionados no Git ou publicados como fixture;
- empacotados no bundle, imagem, Worker, Pages ou add-in;
- carregados no runtime ou usados como fallback operacional;
- convertidos em seed, migration, registro D1 ou dado de demonstração;
- copiados para o SharePoint definitivo do produto ou distribuídos a professores;
- usados como template oficial, base de geração ou configuração implícita;
- referenciados por regra que dependa de nome, quantidade/ordem de abas, turmas, disciplinas, endereços de célula ou qualquer particularidade dos dois casos.

O acesso a eles é permitido somente em ambiente privado e autorizado de homologação, como entrada externa de um teste de regressão. Seus conteúdos não podem aparecer em logs, snapshots públicos ou artefatos de CI.

## Contrato da transformação

A transformação deve separar quatro responsabilidades:

1. leitura da origem legada por adaptador de formato;
2. normalização em um contrato intermediário genérico e validado;
3. instanciação do modelo genérico limpo com IDs e mapeamentos do contexto recebido;
4. validação e preparação da nova instância para conexão, sempre com `SyncEnabled=false` até reconciliação individual.

Descoberta de abas, turmas, componentes, períodos e mapeamentos deve ocorrer por metadados, contratos e validação explícita. Quando a origem não fornecer informação suficiente, o processo deve produzir finding/configuração pendente; não pode inferir silenciosamente uma regra retirada dos golden masters.

## Estratégia de verificação

- Fixtures versionadas devem ser exclusivamente sintéticas, sem PII, e variar nomes, quantidades e ordens de abas, turmas e componentes.
- Testes de generalização devem demonstrar que a mesma implementação transforma origens estruturalmente distintas sem branches por professor.
- Nina e Alanna podem ser executadas apenas fora do Git, em homologação privada, como duas amostras adicionais de regressão.
- Passar nesses dois casos não prova generalização sozinho; a prova exige fixtures sintéticas variadas e inspeção de ausência de especializações no código.
- A verificação deve falhar se qualquer golden master for rastreado ou se runtime/configuração de produção contiver dependência nominal desses professores.

## Consequência para o roadmap

O conversor Excel COM continua apenas como oráculo privado e ponte de migração enquanto necessário. O substituto cloud/administrativo só pode ser declarado equivalente quando transformar casos sintéticos diversos e, adicionalmente, passar regressão privada nos golden masters sem incorporar seus arquivos ou particularidades ao produto.
