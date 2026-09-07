# Commit D1: redução de duplicação e diagnóstico — #559

Data: 2026-09-07. Continuação de #557/#537. Base: `344f3bd9258d3fc2fbb03c4b4eda533e5a498781`.

## Evidência e limite da conclusão

O teste privado do responsável confirmou reconhecimento e preparação, seguidos de `d1 / d1-other / batch` e `transaction / transaction-failed`. Isso localiza a exceção na chamada de gravação D1, mas não identifica a causa remota. Não é prova de CPU, quota, tamanho, corrupção ou ausência de commit.

Foi demonstrada uma ineficiência independente: os parâmetros de INSERT/UPDATE dos streams carregavam `payloadJson` integral, embora esses seis SQLs nunca o lessem. A mesma informação já era enviada no INSERT da versão. Esta entrega elimina essa duplicação e melhora categorias operacionais antes genéricas. **Não declara a causa produtiva identificada nem o upload produtivo corrigido.**

## Alteração de persistência

Em `d1-import-bootstrap-bulk-write-v1.ts`, somente uma cópia transitória de cada linha destinada ao statement de stream perde `payloadJson`. As linhas destinadas a versões mantêm o JSON completo, exatamente como antes. Nenhum SQL, parâmetro efetivamente lido pelo SQL, schema, índice, migração, regra acadêmica, política de retry ou limite de CPU foi alterado.

Continuam um `db.batch()` atômico por arquivo, CAS/contagem de alterações, rollback, histórico e limites de 1.000 linhas/512 KiB por chunk. A projeção menor não permite contornar o limite da linha completa: a versão ainda passa pelo mesmo validador antes do commit. Associações não contêm esse campo e preservam seu conteúdo.

## Medição privada antes/depois

Uma reprodução determinística utilizou o serviço de persistência e SQL existentes, as seis migrations locais e os 18 arquivos privados, em duas bases SQLite isoladas. A única diferença na persistência foi a remoção do campo redundante. Datas/IDs do harness foram fixados para permitir comparação integral. Nenhum dado privado foi enviado ao Git/CI.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Bytes da representação JSON dos statements/params do arquivo afetado | 36.724.994 | 25.039.591 |
| Statements no commit do arquivo afetado | 176 | 136 |
| Soma dos bytes da primeira passagem dos 18 arquivos | 934.065.685 | 618.158.371 |
| Primeira passagem | 18 applied | 18 applied |
| Reimportação idêntica | 18 no-changes | 18 no-changes |

Os bytes são da representação dos statements e parâmetros produzidos pelo harness, não uma captura de rede do site, tamanho do XLSB ou consumo faturado. A redução do arquivo afetado é aproximadamente 31,8%. O máximo do parâmetro individual observado nesse arquivo ficou igual: 524.160 bytes; o ganho veio de retirar dados duplicados, não de ampliar limites.

A comparação de todas as linhas das **28 tabelas de dados** foi idêntica, incluindo JSON completo e histórico. A tabela técnica `gradebook_schema_migrations` foi tratada separadamente: seus horários de aplicação diferem porque as bases foram inicializadas em instantes distintos. Não se afirma igualdade binária dos arquivos SQLite ou igualdade desses horários.

Ambas as variantes funcionaram localmente. Portanto este ensaio comprova redução e equivalência, **não reproduz a exceção remota**. O harness exercitou o pipeline acadêmico persistente da #556 e o writer vigente; não substitui o endpoint autenticado, o runtime remoto, o estado legado produtivo ou a instrumentação completa da #558. Os checks de CI da PR validam a integração sobre a main atual.

## Diagnóstico complementar

A lista fechada acrescenta categorias para CPU D1, storage, quota de leitura/escrita, limite RPC, tipo, serialização, resposta inválida e erro interno. O coletor continua retornando apenas `phase/code/operation`, sem mensagem bruta, SQL, nome, nota, hash, ID acadêmico ou credencial. Eventos desconhecidos continuam `d1-other`; não há adivinhação nem retry novo. A precedência dos erros transitórios já autorizados permanece.

A classificação original já lia a cadeia `Error.cause`; esta não era uma correção de acesso à causa aninhada. As categorias novas cobrem mensagens que antes não possuíam correspondência. A presença de uma categoria não demonstra que o limite esteja sendo atingido. Em particular, não se assume que a aplicação utilize o transporte RPC experimental do D1 ou que um limite RPC explique o erro observado.

Referências primárias consultadas: [Cloudflare: Debug D1](https://developers.cloudflare.com/d1/observability/debug-d1/) e [Cloudflare: D1 limits](https://developers.cloudflare.com/d1/platform/limits/). As orientações distinguem causas de falha e exigem segurança antes de repetir escritas. Elas não documentam um teto único de bytes do lote que permita concluir a causa apenas com esta medição.

## Testes e segurança

Dois arquivos novos trazem 16 testes sintéticos: payload integral nas versões, ausência nos streams, equivalência da gravação nova/alterada, proteção do limite da linha completa, as seis premissas SQL e classificação fechada sem vazamento/retry. A execução direcionada incluiu os testes existentes de escala e plano SQL: **4 arquivos / 21 testes aprovados**. Lint direcionado e compilação de tipos também passaram. O resultado de `npm run verify` da árvore completa deve ser registrado no handoff da PR/issue após o CI.

Nenhum workflow foi alterado nesta entrega. Nenhuma nova tentativa foi feita com a credencial de diagnóstico D1 anteriormente recusada. Não houve consulta/escrita acadêmica remota, export, limpeza, alteração de permissão ou contratação. A publicação usa exclusivamente o workflow existente dentro da continuidade autorizada pelo responsável.

## Aceite pendente

Após checks verdes e publicação confirmada, o teste autenticado deve usar somente o arquivo afetado, uma vez, na versão nova. Se ainda falhar, o diagnóstico poderá separar as novas categorias antes ocultas em `d1-other`; ele ainda pode permanecer genérico para uma mensagem não mapeada. Não solicitar reenvios repetidos do lote inteiro nem promover esta melhoria a prova de solução produtiva. #557 e #537 continuam abertos até identificação/correção e aceite do comportamento real.
