# Desempenho analítico V6 — #815 / PR #816

## Escopo autorizado

Pedido do responsável nesta conversa, retomado em 16/09/2026 UTC. Baseline relida: `a20958e913f71154a99ea3a662c4e52fb68e81ae`. Esta entrega acrescenta as perspectivas Visão geral, Turmas, Alunos, Componentes e Professores; Notas mantém os dois gráficos V5, a tabela, as quatro lentes, o modo e a comparação V4. Nenhum importador, dado acadêmico, regra, autoridade, schema, ACL, binding ou segredo é alterado.

Turma e período são compartilhados por todas as perspectivas; o ano vem do contexto global existente. Modo/comparação/situação permanecem locais de Notas. As perspectivas analíticas observam somente a turma selecionada, no modo regular e na população elegível `null/7`. A página do professor e seu PDF são explicitamente **da turma selecionada**, não uma consolidação escolar ou de todas as suas turmas. Uma abertura de Notas por instrumento replica essa população; alternar normalmente para Notas preserva suas escolhas.

## Contrato aditivo

`shared/gradebook-contracts/performance/performance-analytics-v6.ts`: POST administrativo `/api/gradebook/performance`, `transportVersion: 6`, `operation: analytics`, `year`, `classId`, `period`. Entrada/saída estritas; mesmas proteções de origem, sessão, capability, provider, gate produtivo e `no-store`. Falhas continuam tipadas e opacas. V1–V5 permanecem intactos, sem fallback silencioso.

A resposta contém contexto/horário, mínimo proporcional, síntese, linhas de alunos/células, componentes/instrumentos e professores. Cada professor recebe também os indicadores de seus alunos **já restritos às próprias ofertas**. Identidades, alinhamento, denominadores, duplicatas e limites são validados. Dados ficam somente em memória transitória; nenhuma identificação de aluno vai para a URL, armazenamento persistente ou canal de sincronização.

`createPerformanceAnalyticsV6` reutiliza `readRelationalPerformanceV2`, o coletor de projeções, `performanceCellV2` e as lentes de composição V3. Uma transação `REPEATABLE READ, READ ONLY`, seis instruções no cenário de matriz, sem leitura por aluno/componente. Limites existentes de 150 alunos, 40 ofertas e 1.000 pares; excesso é erro, nunca truncamento. O cenário de 100 alunos × 10 ofertas × 39 instrumentos anuais foi testado abaixo de 2MB de JSON e 500KB gzip. Não é benchmark de rede/produção nem SLA.

## Semântica dos indicadores

- **Aproveitamento, mediana e dispersão:** estatísticas dos percentuais `valor/máximo positivo` de resultados completos; média aritmética por leitura, mediana e desvio-padrão populacional. O denominador é explícito. Ausência não vira zero; amostra vazia retorna `null`. Percentuais acima de 100% são preservados.
- **População e faixas:** abaixo/no limite consideram resultados completos; parciais, sem nota e indisponíveis permanecem separados. “Alunos abaixo” significa ao menos um componente completo abaixo do mínimo configurado, não previsão de reprovação. Faixas do histograma são descritivas, não novas regras de aprovação.
- **Quantitativo/qualitativo:** valores e máximos do núcleo. A diferença entre dimensões usa somente os mesmos pares com ambas completas. A participação no total de pontos é diferente do aproveitamento proporcional; ambos são identificados. Não interpretar qualitativo como comportamento.
- **Instrumentos:** cada identidade de oferta/trimestre/slot mantém máximo, média, mediana, dispersão, cobertura, zeros e frequência abaixo da referência. Não comparar atividades apenas pelo mesmo rótulo nem inferir habilidade/questão/distrator inexistente. Descrições completas continuam disponíveis no detalhe V2; a leitura compacta usa os rótulos estruturais existentes.
- **Cobertura:** lançamentos presentes sobre instrumentos regulares ativos reconhecidos; paralela separada. Definição inexistente não inventa instrumentos nem uma falsa cobertura de 100%. O estado do resultado continua sendo o fornecido pelo núcleo.
- **Trimestres:** trajetória mostra estatística de cada trimestre e seu próprio `n`, sem projeção. A variação usa somente o mesmo aluno/oferta completo nos dois períodos adjacentes (T2/T1 ou T3/T2). Direção por produto cruzado inteiro e diferença em pontos percentuais. Não há comparação interanual. As listas de aumentos/reduções são descritivas, restritas a pares comparáveis, sem causalidade, avaliação docente ou previsão.
- **Distância do limite:** diferença descritiva até o limite proporcional configurado, em milésimos, sem substituir a nota. A interface preserva até três casas nos pontos; percentuais estatísticos usam uma casa e variações não nulas menores que a precisão são sinalizadas.
- **REC/paralela:** aplicabilidade, valores considerados e substituições vêm do motor existente. Registrada, pendente, N/C, R/R e aplicabilidade desconhecida são distintos. Variação após REC pode ser negativa. Contagens por aluno/oferta/trimestre; não são contagens de pessoas únicas.
- **Fonte/autoridade:** AM/U e decisão humana não são substituídos pela análise. Referências, divergências descritivas e resultado calculado permanecem identificados. `authority: calculated-preview`; a existência destes indicadores não é nova emissão oficial.

Este pedido amplia expressamente a superfície descritiva antes limitada pela BN-DEC-024: trajetórias observadas, dispersão, contagens e ordenação por variação, conforme #815. Não altera comparabilidade acadêmica, regras, autoridade, históricos, elegibilidade ou decisões humanas. BN-DEC-023 continua governando integração/publicação após os gates reais.

## Atualização e interface

Reuso integral de `useLiveRefreshV1`/`live-refresh-v1`: invalidação após escritas locais e entre abas da mesma origem, foco/retorno/online e revalidação periódica compartilhada. O mecanismo atual consulta aproximadamente a cada **30 segundos**, com jitter; **não é WebSocket nem push entre dispositivos**. Não foi criado outro scheduler.

Um único V6 atende as cinco perspectivas: trocar entre elas não consulta novamente. Trocar turma/período/ano invalida a resposta anterior; respostas atrasadas são descartadas. Revalidação do mesmo recorte preserva a leitura e os controles, sem substituir o painel por Skeleton. Falha transitória sinaliza a última leitura; perda de autorização limpa a superfície. Desempenho e o novo relatório docente suspendem suas consultas quando outra área do Banco está ativa.

HeroUI React v3 original em Tabs, Select, Card, Table, Meter, Chip, Tooltip, Avatar e estados de carga. Gráficos SVG próprios, sem nova dependência, seguindo a composição visual dos exemplos públicos de [área](https://ui.shadcn.com/charts/area) e [barras](https://ui.shadcn.com/charts/bar) do shadcn. Não são componentes nativos de gráficos do HeroUI, nem uma instalação de shadcn/Recharts. App Factory e seus fluxos não foram executados.

Números são protagonistas; descrições curtas ficam em dicas acessíveis. Tabelas têm pesquisa/ordenação e rolagem interna; mapa e valores não dependem somente de cor. Aluno/componente abrem o detalhe granular existente; Relatórios e Professores usam o mesmo exportador A4, resumido/detalhado, do snapshot autorizado, com espaço para ações e paginação. A geração é explícita, não uma nova emissão acadêmica.

## Extensão da perspectiva Alunos — #833 / PR #834

A perspectiva **Alunos** passa a reutilizar a leitura pedagógica `learning` do mesmo snapshot V6: desempenho atual, evolução trimestral, atenção recorrente, participação avaliada, trajetória, quantitativo × qualitativo, destaques acionáveis, evidência recorrente nomeada, tabela completa de componentes e contexto de recuperação paralela. REC e cobertura ficam recolhidas. Resultado anual e Conselho aparecem somente no recorte anual quando disponíveis. A ausência de nota, de recorrência avaliada ou de par comparável permanece `—`/mensagem de base insuficiente; participação não vira presença nem recebe peso adicional.

Os seletores compartilhados de Aluno, Componente e Professor continuam sendo `Select` HeroUI v3 não modal, agora com abertura controlada. Fecham por clique ou toque externo, Escape e seleção; podem ser reabertos e restauram o foco esperado do gatilho. Selecionar uma entidade chama apenas o callback já existente e não cria nova consulta. A revalidação do mesmo ano/turma/período/aluno preserva DOM, foco e estado local; mudança real de ano, turma, período ou aluno remonta somente o painel de aluno e limpa seu estado local contratado.

Turmas, Componentes e Professores não foram redesenhados nesta extensão. Continuam usando `AnalyticsKpisV6` e o vocabulário estatístico anterior, inclusive aproveitamento, mediana, dispersão e qualidade em destaque; sua uniformização exige decisão de produto própria. Nenhum contrato, consulta, regra acadêmica, schema, persistência ou ACL foi alterado.

Os testes de componente mantêm HeroUI real e cobrem abertura, reabertura, foco, dismiss por ponteiro de mouse/toque, Escape, seleção e callbacks nas três entidades; também cobrem os acessos a período/detalhe, revalidação, mudança de escopo e dados ausentes/não comparáveis. A validação manual de apresentação e comportamento no navegador, em desktop e celular, permanece sob responsabilidade do usuário e não é alegada por esta evidência automatizada.

## Evidências e limites de aceite

Testes sintéticos SQL/HTTP, limites, cliente, React com HeroUI real, filtros, abertura de detalhes, invalidade/atraso de respostas, atualização silenciosa, suspensão de área oculta e autorização. Regra estatística e PDF testados sobre o núcleo existente. Não há dados reais em fixtures, arquivos ou logs.

A validação local inicial identificou três falhas de checks estáticos: o exportador temporário de CI ainda presente e duas mudanças de formatação de código legado. O workflow foi restaurado byte a byte e a formatação exigida pelos checks foi preservada, sem remover ou enfraquecer testes. Evidências do `verify`/CI final, SHAs, merge e deploy são registradas na issue/PR, não deduzidas deste documento.

**QA visual:** Browser plugin ausente. Playwright/Chromium tentou o servidor Vite em `http://127.0.0.1:4173/qa-815.html`, viewport planejada 1440×1050 e 390×844, mas a navegação retornou `ERR_BLOCKED_BY_ADMINISTRATOR` antes da renderização. O bloqueio não foi contornado; não há captura nem aceite visual desktop/mobile da aplicação nesta sessão. O harness foi removido. Testes React não substituem inspeção visual autenticada. PDFs sintéticos foram gerados e renderizados com Poppler para inspeção de A4, margens, tabelas e paginação. Deploy, quando comprovado, não será apresentado como homologação visual.
