# Saúde do Sistema — operação e fechamento da etapa

Documento consolidado da #969/#1091, atualizado no lote #1097. Não substitui a evidência de merge/deploy ou de aceite produtivo registrada em cada PR.

## Caminho de uso

Centro ADM → Saúde do Sistema. O resumo atual e as filas permanecem no início; abaixo há uma única área com abas HeroUI: **Resumo 24h, Histórico, Entrada e telas, Banco e conexões, Fornecedores**. Selecionar uma aba não consulta automaticamente os dados. Abrir a consulta e atualizar são ações explícitas. Somente a aba selecionada fica montada; sair cancela leituras e descarta respostas tardias. Cobertura e explicações ficam recolhidas.

Histórico e ocorrências exibem **seis linhas por página visual**. Anterior/próxima percorrem os dados da consulta atual sem rede. Mais antigos/ocorrências anteriores buscam outro lote limitado. Não há acumulação infinita no navegador nem carregamento antecipado de todos os 30 dias. O filtro atua somente na consulta carregada e informa seu escopo; não afirma ter procurado o período inteiro. Alterações/atenção incluem recuperação, lacunas e amostras sem confirmação. A classificação é calculada na ordem original ANTES do filtro, evitando lacunas falsas. A fronteira entre lotes continua preservada.

## Resumo de 24 horas

POST `/api/platform/system-health/review`, corpo `{}`, RPC `monitoringReview` exclusivamente ADM. Janela termina no início do intervalo atual de cinco minutos; as 288 janelas anteriores estão concluídas. O intervalo em curso não é contado como ausência. Exemplo: consulta às 15:02 usa de 15:00 do dia anterior a 15:00 do dia atual, excluindo a janela iniciada às 15:00.

Leitura read-only das duas tabelas operacionais existentes: até 288 pontos do histórico (limite de rejeição 289) e agregação SQL por fonte/resultado das ocorrências, no máximo 32 grupos (rejeição em 33). Retorna 24 faixas horárias, contagens e durações limitadas, nunca registros individuais de pessoas. Reutiliza a classificação canônica dos pontos; recuperação só existe quando uma amostra normal sucede uma de atenção/intervenção na janela imediatamente anterior. As recuperações contadas têm ambos os pontos dentro da janela consultada.

Janelas sem registro podem anteceder a implantação ou representar falha de coleta: **não são downtime**. Faixas horárias não são uptime nem SLO. As contagens de operações são observações parciais, não todos os acessos, alunos ou uma taxa de falha. Saturação permanece sinalizada; refusas/sessão ausente não são falhas de servidor. Relatos do navegador ficam separados. Falta de tabela ou falha na consulta não vira uma série de zeros.

Cache em memória por binding/ambiente/tenant: 60 segundos com singleflight. Autoridade conferida antes de cache/configuração ausente. Data original preservada; falhas não guardadas como sucesso. Cache por isolate é otimização, não teto global. Browser expira apresentação após dois minutos, sem rede automática. Nenhuma nova gravação, migration ou rotina agendada.

## Fornecedores — status público, não métricas da conta

POST `/api/platform/system-health/providers`, corpo `{}`, mesmas capabilities e fronteira de origem/sessão do monitor. O backend faz somente GETs em duas URLs fixas:

- https://www.cloudflarestatus.com/api/v2/status.json
- https://status.supabase.com/api/v2/status.json

Fontes primárias: https://www.cloudflarestatus.com/api e https://status.supabase.com/api, conferidas em 22/09/2026. Envio de User-Agent identificando o monitor e URL pública do projeto; nenhum cookie, identidade administrativa, token, IP de estudante ou conteúdo escolar é encaminhado. Redirecionamentos proibidos, JSON limitado a 8 KiB por fonte e prazo de 2,5 segundos; consultas independentes e paralelas. Ignora descrição, URLs e texto de incidentes recebidos. Só enum, estado e datas validados saem do backend. Um fornecedor pode falhar sem apagar o resultado do outro.

Cache de cinco minutos em sucesso e de um minuto quando alguma fonte falha/limita a consulta; singleflight, data original e sem retry. UI expira após dez minutos. `page.updated_at` é a data informada pelo fornecedor, não a data de uma medição da escola; pode ser antiga sem que a consulta seja velha. HTTP 429/falha/dado inesperado aparecem como consulta não confirmada, nunca “Normal”.

Status é GLOBAL. Não confirma impacto na região/projeto ou a causa de uma falha no Portal. Tampouco é uma medida de CPU, memória, tráfego, cota ou capacidade contratada. Essa integração pública não autoriza transferir tokens de deploy do GitHub ao runtime nem fecha OBS-03/04 integralmente.

## Investigação rápida

| Sinal observado | Conferência segura |
| --- | --- |
| Publicações/avisos acumulados | Conferir Filas e banco e os horários do Histórico; não forçar importação/publicação para testar. |
| Falha de entrada ou carregamento | Abrir Entrada e telas e separar falha, recusa e limite. Não tratar sessão anônima recusada como queda. |
| Lentidão | Comparar etapa, maior duração e espera de bloqueio no mesmo período; não aumentar conexões sem diagnóstico. |
| Relato de navegador | Conferir o carregamento real da tela, sem capturar dados pessoais; um relato não prova erro do servidor. |
| Status de fornecedor alterado | Comparar horários e verificar os sinais locais; não atribuir causa automaticamente. |
| Janela sem registro | Confirmar horário inicial da implantação e funcionamento do cron; não preencher com dados fictícios. |

Orientações mostradas no resumo derivam dessas regras fechadas. Não há operação corretiva automática, exclusão acadêmica, reset ou ajuste de limites a partir do resumo.

## Consumo e preservação

Sem serviço, binding, classe, cron, secret, grant, plano ou dependência novos. Retenção de 30 dias e exclusão dos dois históricos permanecem inalteradas. As novas leituras usam cotas existentes; não se promete custo zero. O resumo principal básico do ADM mantém sua atualização preexistente de 60 segundos apenas visível; **as abas analíticas não acrescentam polling**. Portal estudantil continua manual, sem atualização de notas em segundo plano. Alertas ficam somente no ADM, sem e-mail ou canal externo.

## Critérios de aceite e pendências

| Camada | Evidência exigida |
| --- | --- |
| Código | Verify, PostgreSQL/runtime, Sonar e revisão do head final; sem desativar casos para liberar. |
| Publicação | Merge commit com SHA esperado, mesma árvore dos gates e workflow oficial concluído. |
| Dados produtivos | Coleta real dos históricos já comprovada nas PRs #1092/#1094; novas leituras autenticadas verificadas separadamente. |
| Interface | Conferir troca de abas, seis linhas, próxima/anterior/filtro, resumo e consultas sem erros de navegador; desktop/mobile. |
| Teste funcional | Navegar com a conta real aprovada privadamente, sem reset, sessão artificial, bypass, screenshot/trace/vídeo ou dado acadêmico em log. Agregados de login não substituem essa prova. |
| Fornecedores completos | Credenciais de leitura específicas e provisionamento autorizado para CPU/memória/tráfego/cotas. Status público não satisfaz esse item. |

Ainda não há baseline/SLO validado para todos os alunos, prova protegida com conta real pelo executor ou integração de métricas privadas dos fornecedores. Não manter recepção dos sinais de servidor como pendência: ela já foi comprovada. Falhas de navegador são testadas com fixtures isoladas; não provocar erros produtivos para obter uma linha. Ausência de browser-* não bloqueia a autoria do receptor, mas também não constitui prova produtiva dele.

## Ambiente de validação

Container desta sessão sem resolução DNS para GitHub; Browser plugin não disponível. Testes de componentes, PostgreSQL descartável e workerd no CI não substituem navegador produtivo. A imagem fornecida pelo responsável mostra a versão anterior e não foi copiada ao repositório. Registrar limitações visuais na PR, sem alegar screenshot pós-edição ou aceite autenticado inexistente.
