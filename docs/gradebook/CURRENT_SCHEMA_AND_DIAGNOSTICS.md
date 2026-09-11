# FINAL-1 — baseline reproduzível e diagnósticos atômicos

Refs #633 / #636 e extensão #648. A baseline e a Auditoria foram integradas anteriormente; em 11/09/2026 a migration aditiva do Conselho V3 foi aplicada após preflight e export lógico validado. Nenhuma linha acadêmica foi alterada por esse DDL.

## Schema atual, não migração antiga

A pasta `migrations/gradebook-simplified/` contém a baseline reconstruída do catálogo e suas extensões ordenadas. `0001` continua a fotografia pré-Conselho: 20 tabelas, 127 colunas, 123 constraints (34 FKs), 38 índices, 4 funções e 3 triggers distintos; os seis eventos em `information_schema.triggers` não são seis triggers. O teste de baseline reexecuta essa fotografia em banco descartável e compara os fingerprints estruturais coletados, sem copiar dados acadêmicos. `0003`/`0004` levam o estado corrente a 28 tabelas, 214 colunas, 188 constraints, 58 índices, 48 FKs e 12 sequências, mantendo 4 funções e 3 triggers. O catálogo JSON de 10/09 permanece evidência histórica da baseline de 20 tabelas, não fingerprint pós-extensão.

As permissões backend da baseline estão em script separado. A consulta efetiva na produção confirmou anon/authenticated sem USAGE e sem leitura/escrita de tabelas; não habilitamos RLS por causa de alertas genéricos. `0004` neutraliza grants padrão do proprietário nas relações novas e mantém a ACL mínima da role backend. O export lógico pré-migration foi validado por conjunto/contagem/JSON/checksum, mas o processo de recuperação ainda precisa comprovar restore de dados, identities/sequence counters, ambiente, ACLs externas, timezone, RPO/RTO e jornadas da aplicação. Baseline de schema e export sem ensaio de restauração não são recuperação institucional comprovada.

## Uma única operação dona do conjunto de diagnósticos

`POST /api/gradebook/import-diagnostics` delega a `replaceGradebookImportDiagnosticsSnapshotV1`. Locks transacionais por fonte (ano/arquivo) e conteúdo (hash) precedem DELETE + INSERT na mesma conexão/transação. Se inserir falhar ou a contagem escrita for incompleta, a transação reverte e mantém as evidências anteriores. Não existe conjunto parcialmente substituído.

A observação vazia é enviada pelo navegador: [] significa que uma leitura completa não encontrou problemas e limpa os anteriores. Falha da leitura/coleta não envia uma observação vazia por suposição. A UI informa quando a Auditoria não confirmou a atualização, mesmo quando não existem avisos novos. Repetir uma observação mantém somente os problemas atuais; não cria histórico de resolvidos. Conteúdo idêntico renomeado tem uma única evidência, atualizada para o nome corrente.

A rota acadêmica não apaga mais diagnósticos por hash separadamente. Isso elimina a corrida em que um import posterior removia evidências registradas por outra aba, além da limpeza antes de uma persistência malsucedida. A gravação de notas/fechamentos e a observação de diagnósticos continuam operações separadas; sucesso de uma não é confirmação da outra.

O contrato V1 não contém uma sequência de observação compartilhada entre abas. Portanto a regra é **última observação confirmada pelo servidor**, não promessa de identificar a versão cronologicamente mais nova de arquivos enviados fora de ordem. Atomicidade não altera essa limitação nem inventa versão/relógio do cliente. Locks protegem integridade, não decidem qual arquivo o operador deveria ter escolhido.

## Evidências e próximos gates

Testes cobrem schema completo, rollback após DELETE, confirmação incompleta, vazio, repetição, rename, isolamento de ano/arquivo, limite de 5.000 itens com número constante de instruções, input duplicado, HTTP/auth/capability/origin/no-store e ausência de escrita acadêmica. PGlite serializa suas transações: o teste de invocações concorrentes não substitui um teste multi-sessão real de contenção/timeout PostgreSQL. Esse teste e a homologação visual após publicação autorizada continuam gates privados.

Clientes já abertos em versão antiga devem recarregar após o deploy, porque antes deixavam de enviar o conjunto vazio. Não assumir resolução de diagnósticos por uma chamada isolada ao endpoint de notas. Leituras/catálogos/centrais e os contratos de adaptação dos demais consumidores continuam pendentes na #633; não foram concluídos por esta baseline.
