# Roadmap do Banco de Notas

As fases organizam o trabalho, mas não formam uma fila rígida. Tarefas sem dependência podem avançar em paralelo. Cada fase informa um resultado observável e só é concluída quando código, testes, documentação, publicação e verificação aplicáveis estiverem completos.

## Estados usados nas issues

- **Planejada:** ainda não pode começar.
- **Pronta para iniciar:** contratos e dependências disponíveis.
- **Em construção:** trabalho ativo.
- **Em testes:** implementação pronta, sendo validada.
- **Bloqueada:** depende de decisão ou entrega identificada.
- **Pronta para publicar:** testes aprovados, aguardando merge/deploy.
- **Publicada:** integrada à `main`, implantada e verificada quando houver resultado visível.

## F0 — Fundação modular e coordenação por agentes

**Objetivo:** tornar o repositório autossuficiente para trabalho paralelo e seguro.

Entregas:

- memória canônica em `docs/gradebook/`;
- protocolo de agentes e precedência de decisões;
- templates de issue e pull request;
- validação automática de pull requests;
- issue principal, issues-pai das fases e primeira fila executável;
- mapa de issues e estado legível por máquina.

**Resultado no site:** nenhum novo recurso funcional; a produção deve permanecer sem regressão.

## F1 — Contrato da fonte e importação confiável

**Objetivo:** transformar o leitor atual em uma camada de importação independente e rastreável, mantendo a experiência publicada.

Entregas:

- contrato de guias, células, D1/D2/D3, situações e REC;
- semântica de vazio, fórmula zero, fórmula válida, zero oficial `0,1` e zero legado;
- separação entre UI, carregador SheetJS, parser, reconhecedor e orquestração do lote;
- manifesto por arquivo com nome, tamanho, modificação, tipo e SHA-256;
- contrato `ImportBatchResultV1` e diagnóstico por arquivo;
- testes com dados sintéticos e validação controlada contra arquivos reais;
- manutenção do limite de 50 arquivos e processamento sequencial.

**Resultado no site:** importação em lote com origem, progresso, falhas isoladas e resumo confiável.

## F2 — Modelo acadêmico normalizado e limites de persistência

**Objetivo:** definir o núcleo de dados sem copiar a estrutura de células do Excel.

Entregas:

- contratos de Ano Letivo, Professor, Turma, Componente, Atribuição, Estudante, Matrícula e Situação;
- contratos de Lançamento, Resultado Trimestral, Recuperação, Resultado Anual, Lote e Auditoria;
- estratégia de identificadores e versionamento;
- portas de persistência e transações independentes da tecnologia física;
- decisão explícita sobre armazenamento físico antes de provisionar infraestrutura;
- contexto global de ano e perfil de avaliação 2026 com defaults.

**Resultado no site:** após persistência mínima, lotes importados podem ser revisados e consultados sem manter o arquivo aberto.

## F3 — Motor nativo

**Objetivo:** implementar, desde a fundação, as regras acadêmicas em um único núcleo puro e testável.

Entregas:

- interpretação semântica de células;
- quantitativo, qualitativo operacional e composição trimestral;
- regra de arredondamento versionada;
- recuperação paralela;
- recuperação final por trimestre, preservando nota substituída;
- total e resultado anual;
- precedência de situações especiais e elegibilidade ao Conselho;
- execução em paralelo à fonte e relatório de equivalência.

**Resultado no site:** comparação explicável entre valor importado e cálculo nativo, sem troca silenciosa de autoridade.

## F4 — Reconciliação e Auditoria

**Objetivo:** garantir idempotência, histórico e erros visíveis.

Entregas:

- chave técnica de lançamento e prevenção de duplicidade;
- versões de arquivos e valores;
- tratamento `FOI PARA` / `ESTAVA NO` sem dupla contagem;
- promoção/rejeição de lote;
- ocorrências estruturais, cadastrais, de nota, cálculo, origem e tempo;
- área funcional de Auditoria com gravidade, origem, ação e resolução;
- bloqueio de falso sucesso quando houver erro crítico.

**Resultado no site:** o usuário revisa o lote, entende pendências e promove apenas dados válidos.

## F5 — Contexto e centrais operacionais

**Objetivo:** oferecer navegação funcional sobre entidades do Banco.

Entregas:

- seletor global de ano;
- cadastro/confirmacão de Professor e atribuições anuais;
- Central do Aluno;
- Central da Turma;
- Central do Componente;
- Central do Professor;
- pesquisa global dessas entidades com autorização;
- read models compactos e detalhes sob demanda.

**Resultado no site:** consulta por aluno, turma, professor e disciplina sem retornar à planilha.

## F6 — Desempenho

**Objetivo:** entregar a camada analítica visual sem criar base ou motor paralelo.

Entregas:

- contrato do read model;
- contexto turma/período/modo;
- matriz `Nº | Situação | Aluno | componentes | Resultado`;
- lentes Resultado, Quantitativo, Qualitativo e Avaliações;
- comparação proporcional entre períodos comparáveis;
- sinais explicáveis, cobertura e investigação;
- poucos gráficos interativos;
- Drawer de aluno e detalhe de célula;
- metas de payload, latência, acessibilidade e ausência de N+1.

**Resultado no site:** matriz da turma utilizável, com aprofundamento progressivo em HeroUI.

## F7 — Conselho de Classe

**Objetivo:** organizar o fluxo real de decisão colegiada sem automatizar a decisão humana.

Entregas:

- elegíveis e não elegíveis com motivo;
- fila compacta por turma e aluno em foco;
- visão anual e detalhes por componente;
- decisões distintas e editáveis com histórico;
- votação numérica opcional e desempate do diretor;
- `Reprovado por falta` somente no fluxo permitido;
- fechamento da turma;
- Conselho trimestral, casos e fotografias históricas imutáveis.

**Resultado no site:** painel operacional completo do Conselho.

## F8 — Boletins e relatórios

**Objetivo:** transformar os mesmos resultados oficiais em documentos e consultas reproduzíveis.

Entregas:

- boletins Sintético, Composição e Detalhado;
- filtros por turma, situação, aluno, período e trimestre visível;
- prévia e PDF pelo mesmo motor;
- snapshots/versionamento e reimpressão;
- lotes com válidos e bloqueados separados;
- relatórios de aproveitamento, recuperação, composição, auditoria e Conselho.

**Resultado no site:** prévia, emissão e histórico de boletins/relatórios.

## F9 — Piloto, segurança e produção institucional

**Objetivo:** validar a operação completa antes da substituição do processo anterior.

Entregas:

- capabilities no servidor e menor privilégio;
- `Cache-Control: no-store` e ausência de persistência indevida no navegador;
- telemetria sanitizada;
- carga e desempenho com massa representativa;
- acessibilidade e movimento reduzido;
- validação paralela com planilhas reais;
- plano de recuperação e operação;
- checklist de mudança de autoridade para o motor nativo, quando aprovado.

**Resultado no site:** versão institucional validada e operável.

## Regra de paralelismo

Antes de assumir uma tarefa, o agente verifica contratos e caminhos. Tarefas que alteram o mesmo contrato ou arquivo central não rodam em paralelo sem coordenação. UI pode avançar com read models sintéticos depois que o contrato estiver congelado; motor e importação podem avançar em paralelo quando compartilham o mesmo contrato de fonte.

## Regra de conclusão

Uma fase só é `Publicada` quando:

1. tarefas obrigatórias concluídas;
2. contratos e decisões atualizados;
3. testes aplicáveis aprovados;
4. nenhum erro crítico conhecido oculto;
5. merge na `main` concluído;
6. workflow de produção concluído;
7. resultado verificado no site, quando visível;
8. `PROJECT_STATE.yaml` e issue-pai atualizados pelo integrador.
