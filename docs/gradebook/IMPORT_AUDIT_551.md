# Importação e reimportação — diagnóstico e correção #551

Data da investigação: 6–7 de setembro de 2026. Repositório: `mcpmieda/ecossistema-escola`.
Base reproduzida: `6d744e5543de3b7d773b2432a8f4809c981c46bd`.
Entrega: branch `fix/bn-551-bounded-import`, PR #556. Sem merge ou deploy nesta investigação.

## Conclusão

O bloqueio não era simplesmente falta de plano pago ou incapacidade de ler XLSB. Foram reproduzidos três defeitos de persistência: UPDATEs com varredura da tabela inteira; reutilização recursiva da cobertura anual agregada como cobertura de cada componente; e parâmetros JSON de leitura maiores que o limite de string do D1. O envio de todas as planilhas em uma requisição agravava a duração e a perda de confirmação.

A correção mantém Workers + D1, os contratos existentes e a seleção múltipla. O navegador prepara e envia um arquivo por vez, confirma individualmente e pausa uma gravação incerta sem perder os arquivos já confirmados. Não cria serviço, assinatura, migração de schema nem regra pedagógica.

Resultado privado: 18/18 arquivos reais aplicados; 18/18 reimportados sem alterações acadêmicas, inclusive no runtime local Cloudflare com D1. Isso não equivale a uma importação em produção: autenticação real, configuração da conta, latência remota e aceite no site continuam sem validação nesta execução.

## Alcance efetivamente examinado

O inventário paginado do GitHub e o bundle de referências acessíveis abrangeram 171 branches, 331 PRs, 225 issues não-PR, 2.455 commits alcançáveis, 876 comentários de issues, 91 comentários de revisão e 653 execuções de Actions. A árvore de main tinha 484 arquivos rastreados. Foram incluídos itens abertos e fechados, além das referências de heads dos PRs disponíveis.

Esses números descrevem a coleta, não a leitura humana integral de cada diff e de cada log. Houve varredura automatizada do histórico e leitura aprofundada do caminho de importação, documentação canônica e correções relacionadas, especialmente a sequência até #537 e #540–#550. Não se declara uma auditoria de segurança integral de todos os subsistemas, nem inspeção de todos os logs/artifacts de todas as Actions. Os números são um retrato da coleta, não contagens atuais permanentes.

A instrumentação temporária da branch serviu para obter código, histórico, dependências públicas e a versão pública do parser. O workflow original foi restaurado no conteúdo final. Nenhuma planilha, nota, identidade de estudante, hash real, banco privado ou credencial foi enviada ao Git ou ao CI. `PROJECT_STATE.yaml` não foi alterado.

## Causas reproduzidas e correções

### 1. UPDATE correlacionado contra toda a tabela

Arquivo: `server/gradebook/persistence/d1/transaction/d1-import-bootstrap-bulk-write-v1.ts`.

As três famílias de UPDATE de streams usavam consultas correlacionadas sobre `json_each`. O plano varria todos os streams existentes, mesmo para alterar poucos registros. O custo piorava conforme arquivos anteriores acrescentavam dados. Um benchmark sintético com 20.000 streams e 200 atualizações mediu 9.958,33 ms antes e 1,19 ms depois, para o mesmo conjunto de alterações. Essa medição é local e não representa o tempo de upload completo.

A alteração usa `UPDATE ... FROM requested` e igualdade sobre a chave primária existente. Mantém `current_version = expected_version`, contagem esperada de alterações e a transação atômica por arquivo. O teste do SQL exato das três famílias exige busca indexada, confirma 200 alterações, preserva 19.800 streams não envolvidos e confirma zero alterações ao repetir o CAS obsoleto. Não foi criado índice nem alterado o schema.

### 2. Cobertura anual agregada realimentada como cobertura individual

Arquivo: `server/gradebook/application/import/import-official-record-materializer-v4.ts`.

`AnnualResult.coverage` resume o currículo inteiro. O código reaproveitava esse resumo como cobertura de um único componente já importado. Assim, o diagnóstico de outros componentes voltava a entrar no próximo cálculo; faltas antigas podiam permanecer mesmo após a chegada dos dados e as explicações cresciam recursivamente. Depois de corrigir apenas o SQL, a reprodução ainda falhava no limite interno de tamanho do registro.

A correção não reaproveita a cobertura global como entrada individual. Os dois totais materializados fornecem a estrutura do componente; seus valores numéricos, ausentes ou insuficientes continuam validados pelo resolvedor anual já existente. As projeções imported/calculated são independentes. Não se transforma nota ausente em zero, não se cria aprovação automática e não se altera `finalDecision`.

Os testes com 18 e 50 componentes independentes mantêm os motivos limitados, preservam insuficiência até a chegada dos componentes necessários e recuperam completude ao final. Também cobrem diagnóstico agregado antigo contaminado e insuficiência independente em cada projeção.

### 3. Parâmetro de leitura maior que o permitido pelo D1

Arquivo: `server/gradebook/persistence/d1/read/d1-import-planning-bulk-read-v1.ts`.

Uma família de leituras empacotava milhares de referências em um único parâmetro JSON. A reprodução no runtime local Cloudflare encontrou `D1_ERROR: string or blob too big: SQLITE_TOOBIG`. Passar em SQLite local comum não havia sido suficiente para revelar esse limite.

Agora as leituras são sequenciais e limitadas simultaneamente a 1.000 itens e 512 KiB UTF-8 por parâmetro. A ordem dos resultados e as verificações de integridade permanecem. Um item isolado grande demais é rejeitado antes de chegar ao D1. O teste inclui um conjunto sintético de menos de 1.000 itens que supera 2 MB, demonstrando que o limite é por bytes, não apenas quantidade.

Em `import-persistence-service-v2.ts`, uma falha de reconciliação por indisponibilidade de leitura agora retorna `unavailable`, não um falso bloqueio acadêmico. O teste correspondente confirma ausência de gravações acadêmicas.

### 4. Confirmação por arquivo e retomada no navegador

Arquivos: `use-import-batch.ts`, `import-persistence-client-v7.ts` e `import-panel.tsx`.

A seleção de 1, 18 ou até 50 arquivos continua sendo uma só ação. A fila compacta somente o próximo arquivo e envia um envelope V7 com um item ao endpoint existente. Não dispara 18 requisições simultâneas. A política restrita de repetição D1 do servidor continua existente; uma falha de transporte não provoca repetição cega da fila pelo cliente.

O cliente limita a espera por tentativa a 120 segundos e rejeita confirmação incompleta. Timeout/HTML/rede indisponível deixa o arquivo em `confirmation-required`: ele pode já estar gravado, e o resultado será reconciliado na retomada explícita. Arquivos confirmados não são reenviados nesta aba; arquivos não iniciados continuam reconhecidos. A sessão expirada pausa o lote. Um bloqueio síncrono evita dois envios por clique duplo. Uma seleção nova acima do limite não descarta a seleção pendente.

A retomada usa somente a memória da aba. Fechar/recarregar a aba exige selecionar os arquivos novamente; a idempotência do servidor reconcilia o conteúdo. Não há armazenamento acadêmico persistente no navegador nem processamento garantido depois que a aba fecha.

## Evidências de teste

| Verificação | Resultado observado |
| --- | --- |
| `npm run verify` local | Lint, tipos, 200 arquivos de teste / 1.374 testes e build aprovados |
| Reconhecimento e compactação privados | 18/18 XLSB reais reconhecidos e pacotes válidos |
| Comparação com leitura integral | 18/18 pacotes equivalentes à leitura completa, normalizados somente metadados da leitura; bytes originais intactos |
| Persistência com migrations e serviço reais em SQLite isolado | Primeira passagem: 18 applied; segunda: 18 no-changes |
| Persistência no runtime local Cloudflare/D1 | Primeira passagem: 18 applied; segunda: 18 no-changes |
| Continuação de banco local parcial | Oito arquivos prévios preservados; dez restantes applied; nova passagem com 18 no-changes |
| Preservação do histórico do banco parcial | Comparação SQL integral das cinco tabelas de versões: nenhuma linha anterior removida ou alterada |
| Alteração de nota sintética | Nova versão aplicada; valor anterior preservado; repetição sem versões acadêmicas adicionais |
| Fila React sintética | 1/18/50 arquivos, falha de rede, confirmação incerta, sessão, indisponibilidade inicial, isolamento e clique duplo |
| SQL e leitura D1 | Busca indexada, CAS obsoleto, conjuntos de 5.399 referências e parâmetros UTF-8 maiores que 2 MB |

O runtime local usou Miniflare/workerd instalado, sem acrescentar dependência ao projeto. Seu máximo de compatibilidade disponível era 2026-08-22, enquanto a configuração do repositório usa 2026-08-24; a configuração de produção não foi reduzida. O harness exercitou o serviço e o binding D1, não o login real do site. O CI contém exclusivamente dados sintéticos. O resultado de CI e o SHA final devem ser consultados no handoff do PR.

No runtime local, a soma das chamadas de persistência foi 53,484 s na primeira passagem e 18,718 s na repetição. A chamada individual mais demorada foi 5,966 s. Esses valores não incluem todo o fluxo do navegador/rede/autenticação e não são promessa de tempo em produção. Os 18 pacotes compactos somavam 9.625.365 bytes; o maior individual tinha 801.381 bytes. Não se concluiu que o tamanho do upload HTTP fosse o bloqueio observado.

Ao reimportar sem alterações, registros técnicos de auditoria da tentativa continuam sendo gravados. `no-changes` significa ausência de mudanças acadêmicas, não necessariamente zero escrita no banco. A comparação de histórico do banco parcial incluiu 41.820 versões acadêmicas anteriores, todas preservadas.

## Cloudflare, pesquisa e alternativas

A documentação oficial confirma que pagar Workers amplia capacidade, mas não corrige algoritmos e não elimina limites de memória, tamanho de string e duração de consultas. Workers mantém 128 MB de memória; D1 documenta 2.000.000 bytes por string/BLOB/linha e 30 segundos por consulta, com observação sobre o batch completo. A arquitetura precisa limitar o trabalho mesmo no plano pago. O HTTP 503/HTML relatado, sozinho, não identifica CPU como causa; faltam logs remotos para atribuir aquele evento específico.

As consultas à documentação do Cloudflare e SQLite respaldam processamento limitado, consultas indexadas e repetição somente quando segura. Não foi encontrado e usado como prova um relato idêntico envolvendo exatamente estas 18 planilhas; a conclusão se apoia na reprodução própria dos defeitos e nos limites oficiais.

Não é necessário converter manualmente todas as planilhas para CSV, trocar de banco ou contratar uma fila para resolver os defeitos reproduzidos. Importar SQL bruto por fora do serviço perderia as garantias de autorização, reconciliação e histórico do aplicativo. Apenas aumentar CPU ou repetir cegamente o lote deixaria as causas intactas. Uma fila persistente poderia atender execução sem aba aberta, mas não foi necessária nem introduzida nesta correção.

A conta Cloudflare, a assinatura ativa, o uso faturado e os logs remotos não ficaram acessíveis nas tentativas com as conexões disponíveis. Foram examinadas a configuração versionada e a documentação pública, não o painel autenticado. Não foi contratado ou provisionado produto. O plano Workers Paid tem mínimo mensal e cobrança de uso; não se promete fatura invariável de US$ 5.

A leitura utiliza os valores de fórmula salvos no Excel. Salvar/recalcular a planilha no aplicativo de origem antes da reimportação continua necessário quando fórmulas mudam; esta correção não incorpora um novo motor de cálculo Excel.

## Handoff e aceite em produção

A correção está isolada no PR #556. Revisar o diff e os checks do SHA final; integrar e publicar pelo processo existente, sem reset do D1 nem alteração de plano. Esta investigação não executa merge, deploy ou escrita acadêmica remota.

Depois da publicação, selecionar as 18 planilhas e observar a confirmação individual. Repetir o mesmo conjunto deve indicar ausência de mudanças acadêmicas. Uma alteração legítima salva na origem deve gerar a versão correspondente, preservando histórico. Em homologação, usar uma nota sintética para verificar esse cenário, não alterar arbitrariamente nota real.

Havendo falha transitória, usar `Retomar pendentes` na mesma aba. Se a sessão expirar, renová-la em outra aba antes de retomar. Não interpretar timeout como prova de rollback, não apagar tabelas e não desabilitar CAS para tentar avançar. Se o ambiente remoto ainda falhar, correlacionar horário, versão publicada e diagnóstico de tempo com os logs do Worker/D1, preservando o arquivo sem confirmação.

O teste de continuação cobre o banco parcial reproduzido; não certifica previamente qualquer estado legado da produção, que não foi inspecionado. A aceitação final depende do lote real no ambiente publicado. Não há promessa de que falhas de rede ou dados inválidos se tornem impossíveis; o objetivo é correção, isolamento e recuperação sem perda silenciosa.

## Referências primárias consultadas

- Cloudflare D1 — Limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare Workers — Limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers — Pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 — Retry queries: https://developers.cloudflare.com/d1/best-practices/retry-queries/
- Cloudflare D1 — Worker binding API: https://developers.cloudflare.com/d1/worker-api/d1-database/
- Cloudflare D1 — Local development: https://developers.cloudflare.com/d1/best-practices/local-development/
- SQLite — UPDATE FROM: https://www.sqlite.org/lang_update.html
- SheetJS — Formulae: https://docs.sheetjs.com/docs/csf/features/formulae/
