# Decisões oficiais do Banco de Notas

Este arquivo é cronológico e normativo para o projeto. Em caso de divergência, prevalece a primeira decisão oficial. Uma decisão posterior só altera outra quando declara expressamente `Substitui BN-DEC-XXX`.

## BN-DEC-001 — Construção integrada e técnica

**Data:** 2026-08-31  
**Status:** vigente

O novo Banco de Notas será construído no repositório `ecossistema-escola`, integrado ao Centro de Administração, com processo técnico e sem governança burocrática desnecessária.

## BN-DEC-002 — HeroUI e shell único

**Data:** 2026-08-31  
**Status:** vigente

HeroUI React v3 é o sistema visual transversal. O Banco usa o mesmo shell, sidebar, topbar, pesquisa, perfil, autenticação e permissões do Centro. Não criar aplicativo, autenticação ou shell paralelo.

## BN-DEC-003 — Experiência funcional para usuários leigos

**Data:** 2026-08-31  
**Status:** vigente

A interface deve parecer um sistema de trabalho pronto para uso, não um painel técnico de configuração. Configurações ficam em segundo plano, com defaults válidos. A navegação é orientada a tarefas, linguagem escolar e aprofundamento progressivo.

## BN-DEC-004 — Fontes iniciais restritas

**Data:** 2026-08-31  
**Status:** vigente

A fonte operacional inicial são as planilhas atuais dos professores. O arquivo `BANCO DE NOTAS 2026.xlsb` é referência funcional para o comportamento global. Outras fontes, incluindo SMECEL e sincronizações automáticas, ficam fora do escopo inicial.

## BN-DEC-005 — Importação direta, sem planilha técnica intermediária

**Data:** 2026-08-31  
**Status:** vigente

O usuário importa os arquivos reais existentes em XLSB/XLSX/XLS. Não exigir conversão para planilha técnica padronizada. Uma camada de adaptadores internos pode existir; uma nova planilha padrão só será considerada se uma fonte futura demonstrar necessidade concreta.

## BN-DEC-006 — Preservação integral da fonte

**Data:** 2026-08-31  
**Status:** vigente

A importação nunca altera o arquivo original. Todos os registros encontrados são preservados, inclusive posições históricas, transferidos e movimentos `FOI PARA` / `ESTAVA NO`. Filtros futuros determinam a população vigente sem apagar histórico.

## BN-DEC-007 — Motor nativo construído junto com o Banco

**Data:** 2026-08-31  
**Status:** vigente

Toda referência documental a “motor nativo futuro” deve ser interpretada como motor obrigatório nas fases iniciais da construção. Ele será implementado em funções puras, versionadas e testáveis. Durante a migração, os valores importados e os calculados pelo motor permanecem separáveis e comparáveis. A mudança de autoridade oficial para o motor exige aceite explícito; não ocorre silenciosamente.

## BN-DEC-008 — Uma regra acadêmica, um único núcleo

**Data:** 2026-08-31  
**Status:** vigente

Importação, Desempenho, Conselho, Boletins, pesquisa e relatórios não mantêm motores próprios. Todos consomem contratos e resultados do domínio acadêmico central.

## BN-DEC-009 — Arquitetura modular, não uma página gigante

**Data:** 2026-08-31  
**Status:** vigente

O Banco será dividido em módulos com rotas e limites claros: Importação, domínio/motor, Auditoria, centrais de entidades, Desempenho, Conselho, Boletins/Relatórios e Configurações. As responsabilidades ocultas do Excel viram serviços e contratos, não telas que imitam guias.

## BN-DEC-010 — Desempenho como projeção analítica

**Data:** 2026-08-31  
**Status:** vigente

Desempenho é uma área read-only sobre dados e resultados oficiais do Banco. A matriz da turma é o centro da experiência; detalhes aparecem por interação. Desempenho não possui cadastro, armazenamento ou cálculo acadêmico paralelo.

## BN-DEC-011 — Desenvolvimento paralelo por issues e contratos

**Data:** 2026-08-31  
**Status:** vigente

As fases serão issues-pai. Entregas pequenas serão issues executáveis por diferentes agentes, com caminhos permitidos, contratos, dependências, critérios de aceite e testes. O repositório permanece único; branches são curtas; integração ocorre continuamente na `main`.

## BN-DEC-012 — Memória oficial no repositório

**Data:** 2026-08-31  
**Status:** vigente

Conversas não são memória oficial. Qualquer agente deve compreender e continuar o projeto lendo `AGENTS.md`, `docs/gradebook/`, a issue atribuída e seus contratos. O integrador mantém `PROJECT_STATE.yaml` após merges.

## BN-DEC-013 — Publicação progressiva no site oficial

**Data:** 2026-08-31  
**Status:** vigente

Toda entrega independente, utilizável e não bloqueada por outra fase deve ser integrada à `main`, publicada pelo workflow oficial e verificada em `admin.escolaieda.com`. Código incompleto só pode chegar à `main` quando não quebra a aplicação e permanece inacessível até estar pronto.

## BN-DEC-014 — Segurança do repositório público

**Data:** 2026-08-31  
**Status:** vigente

Nenhum dado real de estudante pode ser versionado ou exposto em issues, PRs, fixtures, logs ou screenshots. Testes no repositório usam dados sintéticos ou anonimizados; validações com arquivos reais ocorrem de forma controlada fora do Git.

## BN-DEC-015 — Precedência da primeira divergência

**Data:** 2026-08-31  
**Status:** vigente

Quando instruções entrarem em conflito, a mais antiga permanece oficial. Qualquer substituição deve citar a decisão anterior, explicar o impacto e ser confirmada explicitamente pelo responsável.

## BN-DEC-016 — Cloudflare D1 como armazenamento físico

**Data:** 2026-08-31  
**Status:** vigente  
**Origem:** issue #200

Cloudflare D1 será o armazenamento físico principal da base acadêmica do Banco de Notas. O navegador não será a base institucional e as planilhas permanecem fonte documental/importação, não banco transacional.

O domínio continua independente do fornecedor: código acadêmico conhece portas de persistência, não `D1Database`, SQL, Wrangler ou bindings. Todo acesso real ocorre pelo backend autorizado do Centro. Banco, binding, migrations, índices e recuperação serão criados somente por issues próprias; esta decisão não autoriza provisionamento silencioso.

O plano gratuito pode ser usado em desenvolvimento e piloto, com medição de leituras, escritas e armazenamento. Se o volume exigir, a evolução prevista é alterar o plano Cloudflare sem trocar a tecnologia ou o modelo do Banco.

## BN-DEC-017 — Identidade lógica da fonte e reimportação incremental

**Data:** 2026-08-31  
**Status:** vigente

O nome do arquivo é metadado de origem, não identidade permanente. O SHA-256 identifica conteúdo binário idêntico:

- mesmo hash com outro nome é o mesmo conteúdo renomeado e não gera duplicação;
- hash diferente pode ser nova versão da mesma fonte lógica quando ano, professor e contexto acadêmico forem compatíveis;
- contexto incompatível ou ambíguo exige confirmação humana; o sistema não associa silenciosamente;
- salvar novamente um arquivo pode mudar bytes/metadados sem mudar notas, portanto a comparação acadêmica relevante sucede a comparação do hash;
- valores inalterados não criam nova versão acadêmica;
- valores novos ou alterados criam nova versão e preservam integralmente a versão anterior.

A reimportação será idempotente, incremental e auditável. Não se adotará a estratégia de apagar a base e recriar todas as linhas a cada atualização.

## BN-DEC-018 — Saúde e limites são globais no Centro de Administração

**Data:** 2026-08-31  
**Status:** vigente  
**Issue planejada:** #220

Quotas, consumo, disponibilidade e saúde de Cloudflare, D1, Workers e integrações pertencem ao Centro de Administração, em área administrativa global `Configurações → Saúde e limites`.

Cada módulo pode fornecer métricas próprias, inclusive impacto estimado de importações do Banco de Notas, mas não mantém um painel isolado de infraestrutura. Tokens e credenciais nunca chegam ao navegador; métricas são obtidas por backend autorizado e não podem conter nomes, notas ou payload acadêmico. A indisponibilidade da fonte de métricas deve gerar estado parcial/desatualizado, não indisponibilidade do ambiente inteiro.

## BN-DEC-019 — Autoridade nativa, comparação proporcional e correção determinística

**Data:** 2026-09-02  
**Status:** vigente  
**Origem:** issue #349  
**Complementa:** BN-DEC-007; não altera a autoridade ativa antes do rollout autorizado

O motor nativo do Banco Online é a autoridade-alvo dos resultados acadêmicos determinísticos cobertos por perfil oficial versionado. A planilha permanece fonte documental/de importação e referência independente de Auditoria. Valores e estados `imported` e `calculated` permanecem separados, versionados, preservados e auditáveis. Conselho de Classe e demais decisões explicitamente humanas permanecem fora da autoridade automática do motor.

A mudança efetiva de autoridade continua temporal, versionada, reversível e não retroativa por padrão. O ano, período e data exatos de vigência somente serão definidos após piloto real aprovado e pelos gates próprios de ativação. Histórico, snapshots, boletins, reimpressões e decisões emitidos sob autoridade anterior permanecem reproduzíveis segundo a autoridade e a versão vigentes quando foram produzidos.

### Comparação proporcional de desempenho

A comparação entre trimestres ou períodos comparáveis usa `basis = percentage`, com base percentual normalizada pela semântica oficial do perfil/versionamento aplicável a cada lado. Pontos brutos de escalas diferentes não são base válida para comparação proporcional.

Assim, por exemplo, `24/30 = 80%` e `32/40 = 80%` são equivalentes para essa comparação. A regra não fixa `T3 = 40`: cada período usa o máximo e a semântica percentual oficiais do respectivo perfil versionado, preservando a correção quando a distribuição institucional mudar.

Mudança apenas do máximo do período não impede a comparação quando os dois lados podem ser normalizados oficialmente. Se diferenças de perfil alterarem a semântica além da escala, os períodos somente são comparáveis quando houver compatibilidade oficialmente declarada; na ausência dela, o estado é `not-comparable`.

Esta decisão não autoriza tolerância ou epsilon. Também não autoriza percentual por atividade, média, ranking, índice ou outra métrica derivada. A comparação proporcional deve poder ser desativada por configuração administrativa server-side e auditável, nunca por decisão local do navegador.

### Divergência entre Banco e planilha

A verificação preserva exclusivamente os estados oficiais `match | expected-difference | mismatch | not-comparable`.

Um `mismatch` com possível impacto acadêmico interrompe o fluxo ou piloto afetado para investigação e impede liberação, publicação ou fechamento definitivo enquanto não houver reconciliação autorizada. A investigação não presume que a planilha esteja errada nem que o Banco esteja errado. Divergência também não devolve automaticamente autoridade à planilha após futura ativação do motor nativo.

O resultado calculado pelo motor, o estado de verificação contra a fonte importada e o estado de liberação institucional permanecem separados. Um resultado pode estar calculado e ainda assim permanecer bloqueado para liberação por reconciliação pendente.

### Correção automática determinística

Correção automática é autorizada somente quando todas as condições abaixo forem simultaneamente verdadeiras:

1. a causa raiz estiver identificada por evidência oficial suficiente;
2. existir exatamente uma correção legítima derivável dos contratos e regras vigentes;
3. a correção não exigir julgamento pedagógico ou administrativo;
4. a operação gerar nova versão ou registro auditável e preservar a evidência anterior;
5. CAS, idempotência, transação e rollback aplicáveis forem preservados.

Quando inequivocamente demonstráveis, são exemplos permitidos: corrigir estado normalizado interno produzido incorretamente pelo importador quando a célula ou fonte observada determina univocamente o valor correto; recomputar e versionar resultado derivado obsoleto a partir de inputs oficiais e regra versionada já vigente; e reaplicar transformação determinística corrigida sem apagar o histórico anterior.

Não é correção automática autorizada: editar silenciosamente o arquivo Excel original; escolher entre duas interpretações plausíveis; inventar valor ausente; transformar decisão humana em cálculo; alterar código ou regra em runtime por auto-modificação; sobrescrever manualmente resultado calculado sem fluxo oficial; ou corrigir automaticamente a planilha quando a própria fonte documental estiver errada. Nesse último caso, deve existir ocorrência registrada e correção da fonte por fluxo autorizado.

Se a causa for defeito de código do motor ou do importador que exija mudança de regra ou implementação, o sistema bloqueia o caso e registra a evidência. O código é corrigido pelo processo normal de desenvolvimento e, somente depois, os dados são reprocessados e versionados pelos fluxos oficiais.

### Produção, piloto e autoridade futura

Fica autorizada a continuidade futura, somente após contratos, implementações e gates técnicos correspondentes estarem verdes e por issues operacionais próprias, para criação/configuração do D1 acadêmico produtivo e binding, migrations remotas controladas, smoke acadêmico produtivo e piloto privado real Banco × planilha. Essa autorização de direção não executa nem dispensa readiness, evidência, rollback ou autorização controlada de cada gate. Dados reais continuam proibidos no repositório e na CI públicos.

Durante o piloto, `imported-source` permanece autoridade. O Banco calcula em paralelo e compara de forma independente com a planilha; divergências relevantes interrompem o piloto até investigação e reconciliação conforme esta decisão.

Com piloto aprovado e todos os gates satisfeitos, a #347 poderá ativar `native-engine` somente para vigência explicitamente definida. A partir dessa futura ativação, o Banco determinará os resultados determinísticos cobertos pelo perfil vigente, enquanto a planilha continuará preservada e comparada como referência independente. Um `mismatch` material poderá bloquear publicação ou fechamento até reconciliação, mas não devolverá automaticamente autoridade à planilha.

A presença desta decisão no repositório não altera o `authorityMode`, não provisiona produção, não aplica migrations, não executa smoke ou piloto e não implementa a #347. A remoção do hard stop `comparison-semantics-not-integrated` da #189 ainda exige contrato compartilhado, implementação e integração próprios.

## BN-DEC-020 — Piloto integral e autoridade nativa imediata por escopo

**Data:** 2026-09-02  
**Status:** vigente  
**Origem:** issue #384  
**Complementa:** BN-DEC-019  
**Substitui BN-DEC-019:** exclusivamente quanto à suposição de rollout ou vigência única/global da autoridade nativa; todas as demais regras, separações, bloqueios e salvaguardas da BN-DEC-019 permanecem vigentes.

O primeiro piloto acadêmico real deve abranger a escola inteira, e não uma amostra reduzida. A janela continua privada e controlada e, durante a validação, `imported-source` permanece a autoridade. O piloto integral não remove nenhum gate: continuam obrigatórios autorização server-side, runbook de recuperação, RPO/RTO definidos, stop conditions e evidência pública apenas agregada e sanitizada.

### Escopo do piloto integral

No escopo suportado, a validação deve exercitar de ponta a ponta:

- importação e reimportação;
- Auditoria e reconciliação;
- Desempenho e comparação proporcional;
- Boletins, snapshots e reimpressão;
- Relatórios;
- Conselho e decisões humanas exclusivamente nos limites já formalizados;
- restart, recuperação, CAS e histórico;
- limitações conhecidas process-local quando forem efetivamente atingidas pelo piloto.

Um escopo somente pode ser considerado aprovado para futura ativação nativa quando não houver `mismatch` material não reconciliado nele; qualquer `expected-difference` possuir razão oficial e documentada; `not-comparable` não for tratado como `match`; defeitos de software identificados tiverem sido corrigidos pelo fluxo normal de desenvolvimento e o escopo tiver sido revalidado; e segurança, privacidade, histórico, recuperação e stop conditions permanecerem verdes. Não se exige identidade absoluta quando houver `expected-difference` oficialmente válida.

### Autoridade nativa imediata após aprovação do escopo

Depois que um escopo acadêmico estiver aprovado, `native-engine` deve poder tornar-se a autoridade para novos resultados desse escopo imediatamente a partir do instante de implantação ou ativação oficialmente registrado, inclusive dentro do ano letivo em curso. Não existe espera automática até o próximo trimestre ou próximo ano.

Cada vigência continua obrigatoriamente explícita, temporal, versionada, não retroativa, auditável e reversível conforme o runbook. Resultados, snapshots, boletins, reimpressões e demais registros anteriores à vigência preservam a autoridade histórica sob a qual foram produzidos.

### Rollout progressivo por escopo acadêmico

A transição para `native-engine` é progressiva, por escopo acadêmico formal, e não um flip global obrigatório. A representação final deve preferir identidades acadêmicas já existentes, como `academicYearId` combinado com turma, `teachingAssignment` e/ou disciplina, conforme o contrato versionado final determinar.

Escopos distintos podem, portanto, permanecer temporariamente em autoridades diferentes: um escopo aprovado pode operar com `native-engine` para novos resultados a partir de sua vigência registrada enquanto outro continua em `imported-source` até cumprir seu próprio gate. A seleção de autoridade nunca pode depender de flag local, preferência do navegador ou escolha ad hoc do cliente.

### Evolução contratual obrigatória antes da #347

O contrato V1 já representa `authorityMode` nos resultados e os registros possuem contexto acadêmico suficiente para sustentar uma futura seleção por resultado/escopo. Contudo, consumidores oficiais V1 como `BulletinModelV1` e `ClassPerformanceReadModelV1` ainda restringem sua autoridade a `imported-source`.

Por isso, a #347 não pode ser implementada como simples flag global. Antes de sua implementação final, uma issue própria `[BN][CONTRATO]` deve definir evolução versionada e compatível para seleção de autoridade por escopo e para os consumidores oficiais, preservando a interpretação e o histórico V1. Conversão silenciosa de registros históricos é proibida.

### Papel da planilha após ativação nativa

Depois que um escopo migrar para `native-engine`, upload e reimportação de planilha continuam autorizados como entrada ou atualização de lançamentos e como evidência documental/auditável. Os valores importados permanecem preservados e disponíveis para comparação independente, enquanto o motor nativo recalcula os resultados determinísticos cobertos pelo perfil vigente.

Divergência não devolve automaticamente autoridade à planilha. `Mismatch` material continua bloqueando liberação ou fechamento conforme a BN-DEC-019, e correção automática continua limitada aos casos deterministicamente elegíveis já formalizados.

### Conselho e decisões humanas

Conselho de Classe e demais decisões explicitamente humanas permanecem fora da autoridade automática do motor. O rollout por escopo não transforma decisão humana em cálculo e não cria regra de Conselho.

### Sequenciamento operacional

A Onda 23 permanece inalterada e sequencial: `#380 → #381 → #382 → #383`. Ela prepara recurso/binding, migrations e smoke controlado e deve terminar com o production gate novamente `OFF`. Esta decisão não antecipa dado real, piloto ou ativação antes da conclusão verde da #383.

Depois da #383, a Onda 24 deve começar pela revisão das limitações conhecidas contra o piloto integral, abrir a janela privada da escola inteira ainda com `imported-source` autoritativo, executar comparação e reconciliação completas, corrigir deterministicamente apenas o que for elegível e corrigir defeitos de software pelo fluxo normal, revalidar os escopos e produzir um mapa explícito de escopos `eligible-for-native-activation` versus bloqueados.

A #347 permanece bloqueada até a Onda 23 e a Onda 24 estarem concluídas com evidência suficiente, a evolução contratual de autoridade por escopo estar integrada, o primeiro escopo de ativação estar definido, a vigência imediata estar explicitamente registrada para cada ativação ou lote, rollback/recovery estarem confirmados e não existir hard stop acadêmico material no escopo a ativar. Quando liberada, a #347 deve executar rollout progressivo por escopo, não uma ativação global obrigatória.

Esta decisão não cria critério automático de prontidão por turma ou disciplina, tolerância ou materialidade numérica, retroatividade, seleção de autoridade no cliente, regra de Conselho, fallback automático para a planilha nem conversão silenciosa do histórico V1. Sua publicação, por si só, não altera `authorityMode`, não executa piloto, não abre o runtime acadêmico produtivo, não provisiona recurso, não aplica migration e não implementa a #347.
