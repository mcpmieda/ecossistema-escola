# D1 — evolução da importação até V8

## Problema que precisou ser resolvido

O importador começou com payloads que carregavam estruturas de planilha grandes demais para o caminho backend/D1. O trabalho evoluiu até separar claramente três coisas:

1. reconhecimento do arquivo no navegador;
2. transporte acadêmico compacto;
3. persistência versionada no backend.

O ponto decisivo foi parar de transportar workbook/fórmulas e transportar apenas os valores acadêmicos necessários.

## V8: snapshot de valores

O transporte V8 mantém o arquivo original como fonte documental, mas envia ao servidor somente um snapshot compacto de valores reconhecidos.

Regras consolidadas:

- leitura XLSB/XLSX/XLS ocorre no navegador;
- fórmulas não são transportadas como fórmulas;
- o servidor recebe valores e estados acadêmicos já reconhecidos;
- compatibilidade com transportes anteriores foi mantida durante a transição.

### Semântica de zero

Uma regra crítica do contrato V8:

- `0` representa célula vazia/ausente no snapshot acadêmico;
- `0.1` representa o zero acadêmico explícito quando a planilha usa essa convenção;
- recuperação `0`/`1` continua preservada conforme a semântica própria daquele campo;
- fórmula/erro sem valor cached disponível vira `unavailable`/dados insuficientes; nunca se inventa zero.

Essa distinção deve permanecer em qualquer backend futuro.

## O navegador não era o gargalo

Medições mostraram que reconhecimento e compactação eram rápidos em comparação com a persistência. Em um arquivo isolado de referência, o payload V8 ficou em aproximadamente 104 KB e sem células indisponíveis, enquanto o tempo de persistência D1 dominava a operação.

A lição foi instrumentar fases separadas antes de otimizar: `file read`, reconhecimento, compactação, request, planejamento e persistência.

## Staging para contornar limites D1

A persistência grande não podia depender de uma única chamada com quantidade ilimitada de parâmetros. A solução foi introduzir staging limitado:

- materializar os writes planejados em lotes menores;
- gravar staging em chamadas limitadas;
- evitar extrapolar limites de parâmetros/RPC;
- executar a aplicação acadêmica final em uma única unidade atômica.

A migration `0006_import_staging_v1.sql` preserva esse conhecimento.

## `db.batch()` como fronteira atômica final

Depois do staging, a aplicação das alterações acadêmicas finais foi organizada em um `db.batch()` único para manter atomicidade do conjunto final de writes.

O padrão que funcionou foi:

1. preparar/validar todos os writes;
2. materializar payloads grandes de forma limitada;
3. conferir expectativas de versão;
4. aplicar a unidade acadêmica final atomicamente;
5. somente então considerar a importação persistida.

## Reimportação idempotente

A importação não deve gerar histórico novo quando o estado acadêmico não mudou.

O fluxo preserva:

- detecção de fonte lógica;
- comparação do estado acadêmico relevante;
- criação de versão somente para mudanças reais;
- resposta `no-changes` quando aplicável;
- histórico anterior intacto.

## Captura/staging como ferramenta de teste

Uma abstração particularmente útil foi a transação de captura/staging: executar a lógica de planejamento normalmente, capturar os writes que seriam feitos e permitir reproduzi-los em outro backend ou teste sem alterar a autoridade oficial.

Esse mecanismo foi posteriormente reutilizado nos benchmarks PostgreSQL shadow. Portanto, ele não é apenas uma otimização D1; é um ponto de desacoplamento útil para qualquer migração de storage.

## Padrões a reutilizar

- transporte compacto de valores, não workbook;
- planejamento separado da aplicação física;
- captura dos writes planejados;
- chunking limitado;
- CAS antes de aplicar;
- aplicação final atômica;
- resposta explícita `applied | no-changes | conflict/unavailable`;
- nenhum valor acadêmico inventado para preencher lacunas técnicas.
