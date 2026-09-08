# D1 — desempenho e diagnóstico

## Método que evitou conclusões erradas

O principal aprendizado de performance foi medir cada fase separadamente antes de trocar tecnologia ou reescrever o importador.

A sequência de diagnóstico usada foi:

1. leitura do arquivo;
2. reconhecimento do workbook;
3. compactação V8;
4. tamanho do request;
5. tempo de planejamento backend;
6. staging/transporte ao banco;
7. aplicação das versões;
8. caminho `no-changes`;
9. total end-to-end.

Isso mostrou que a lentidão observada não estava no XLSB, nas fórmulas ou no navegador depois do V8; estava predominantemente no backend/persistência D1 para a carga acadêmica expandida.

## Linha de base observada

Em produção controlada, um arquivo isolado de referência com request V8 de aproximadamente 104 KB apresentou, no caminho D1, persistência `applied` em torno de 30,55 s. A reimportação `no-changes` ficou em torno de 10,03 s.

No lote privado de 18 arquivos, todos foram reconhecidos e persistidos, mas o tempo agregado de persistência ficou na ordem de vários minutos, com a maior parte do tempo no servidor.

Esses números são evidência operacional daquele modelo e daquela carga; não são uma afirmação de que D1 sempre terá esse comportamento em qualquer aplicação.

## O que funcionou bem no D1

D1 foi adequado e simples para:

- schema relacional pequeno/médio junto do runtime Cloudflare;
- leituras administrativas e projeções controladas;
- snapshots e histórico append-only;
- Conselho e boletins com baixa taxa de escrita;
- CAS e versionamento explícito;
- operação sem serviço de banco separado;
- desenvolvimento e smoke sintético com integração simples ao Pages/Workers.

## Onde a carga do Banco de Notas pressionou o modelo

A importação acadêmica real expande um request compacto em milhares de entidades, registros, associações e versões. Os pontos de pressão foram:

- grande quantidade de statements/params;
- custo de round trips entre Worker e D1;
- necessidade de staging para não ultrapassar limites de parâmetros/RPC;
- custo de verificar estado atual e versões;
- custo de `no-changes` mesmo quando nada precisava ser escrito;
- volume de writes versionados por uma única importação.

A solução de staging + batch tornou o fluxo confiável, mas não eliminou o custo total para essa carga.

## Como provar que o problema era a persistência

Foram construídos benchmarks progressivos, sempre sem mudar a autoridade oficial:

- benchmark sintético de milhares de streams;
- probe de conexão, parâmetros, JSONB, escrita, transação e função;
- replay shadow de estado real já normalizado;
- execução do próprio request V8 em modo shadow.

O caminho PostgreSQL via Hyperdrive processou a aplicação de dezenas de milhares de itens em aproximadamente 1,2–1,3 s na fase set-based de aplicação, enquanto o total shadow permaneceu maior por planejamento, conexão, upload e segunda passagem `no-changes` do benchmark.

A comparação demonstrou que o gargalo do D1 era específico ao padrão de persistência massiva/versionada do importador, não ao reconhecimento do arquivo.

## Diagnóstico JSONB/Hyperdrive — lição paralela

Durante o benchmark PostgreSQL surgiu um problema importante que vale preservar: serializar JSON manualmente e deixar o driver inferir JSONB pode resultar em dupla serialização ou semântica incorreta. O caminho estável no ambiente testado foi enviar o JSON serializado explicitamente como PostgreSQL `text` (OID 25) e converter no servidor com `::jsonb`.

Isso não é um aprendizado de D1 em si, mas foi descoberto justamente ao comparar o caminho D1 e deve ser lembrado em futuras integrações Hyperdrive/Postgres.

## Quando ainda escolher D1

D1 continua sendo uma opção forte quando:

- a aplicação já vive integralmente em Cloudflare;
- o volume de escrita por transação é moderado;
- não há necessidade de operações set-based muito grandes;
- simplicidade operacional vale mais que throughput de escrita;
- histórico/snapshots têm baixa frequência de mutação;
- o modelo pode trabalhar com limites conhecidos de statements/params.

Para cargas parecidas com o importador do Banco de Notas, a recomendação é medir cedo um corpus representativo antes de comprometer o storage definitivo.

## Checklist para investigações futuras

Antes de culpar o banco:

- medir navegador e servidor separadamente;
- registrar bytes do request e bytes do estado expandido;
- separar conexão, leitura, planejamento, upload e apply;
- medir `no-changes` de forma independente;
- contar statements e round trips;
- verificar limites de parâmetros;
- confirmar que retries não estão duplicando trabalho;
- testar uma operação set-based equivalente em um backend alternativo;
- manter rollback e dados sintéticos/privados durante o diagnóstico.

O maior ganho deste trabalho não foi apenas encontrar um backend mais rápido: foi transformar um problema de “upload lento” em medições reproduzíveis por fase.
