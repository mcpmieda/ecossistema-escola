# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — qual issue pode ser executada agora.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, progresso e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.

## Estado atual

Seis ondas foram integradas. As entregas mais recentes são:

- #234/PR #240: recuperação paralela nativa V1;
- #235/PR #241: migration 0003, catálogo fonte lógica ↔ stream e adaptador D1 local de leitura;
- #236/PR #239: executor transacional abstrato do plano de reimportação.

O código vigente da sexta onda está no commit `e8be42bd65b0a59d837ee6ca8283d9564967a6db`; o deploy Cloudflare Pages `33441758173` foi concluído com sucesso.

A sétima onda está pronta para três agentes independentes:

- [#242 — consolidar resultado trimestral nativo V1](https://github.com/mcpmieda/ecossistema-escola/issues/242);
- [#243 — formalizar associação transacional fonte lógica ↔ stream V1](https://github.com/mcpmieda/ecossistema-escola/issues/243);
- [#244 — implementar recuperação final nativa V1](https://github.com/mcpmieda/ecossistema-escola/issues/244).

A integração da sétima onda fica reservada à [#246](https://github.com/mcpmieda/ecossistema-escola/issues/246). A [#245](https://github.com/mcpmieda/ecossistema-escola/issues/245), de escrita/transação D1 local, permanece bloqueada até a integração da #243.

## Decisão de armazenamento

A issue #200 aprovou **Cloudflare D1** como armazenamento físico principal da base acadêmica. O domínio continua independente do fornecedor por meio das portas de persistência.

Estado real:

- migrations locais 0001–0003 integradas;
- 21 tabelas para contexto, entidades, fontes, lotes, registros, catálogo por fonte, reconciliação e Auditoria;
- histórico append-only, chaves estrangeiras por ano, índices e controle otimista;
- adaptador local de leitura integrado;
- executor de promoção validado contra porta transacional em memória;
- nenhum banco D1, binding, secret ou migration remota de produção criado;
- nenhum adaptador D1 de escrita operacional ainda.

## Objetivo

Construir um Banco de Notas funcional, modular, auditável e acessível a usuários leigos, integrado ao Centro de Administração e alimentado inicialmente pelas planilhas atuais dos professores. O sistema preserva a origem dos dados, implementa o motor nativo junto com o núcleo e publica progressivamente cada entrega independente no site oficial.

## Em produção

- área `Banco de notas` no mesmo shell do Centro;
- interface HeroUI React v3;
- pesquisa global integrada ao módulo;
- importação local de até 50 arquivos por lote;
- leitura sequencial de XLSB, XLSX e XLS;
- reconhecimento de turmas, alunos, disciplinas, trimestres, quantitativo, qualitativo e recuperação;
- SHA-256 calculado no navegador antes do reconhecimento;
- manifesto por arquivo com nome, tipo, tamanho, modificação, versões e instante de leitura;
- progresso separado entre preparação/hash e reconhecimento;
- hash abreviado com acesso ao valor completo;
- falha e diagnóstico isolados por arquivo;
- processamento somente em memória, sem upload nem persistência acadêmica.

O operador confirmou o happy path da interface com dois arquivos XLSB. O smoke completo ainda precisa observar a etapa transitória de hash, expandir o valor completo e provocar uma falha isolada controlada.

## Núcleo já integrado

### Fonte e importação

- contratos de fonte, manifestos, lotes, diagnósticos, reconciliação e Auditoria;
- reconhecedor modular e suíte sintética;
- SHA-256 e proveniência visível;
- planejador de reimportação que separa igual, novo, alterado, ausente e bloqueado.

### Motor nativo

- interpretação semântica de células;
- arredondamento acadêmico V1;
- composição trimestral 30/30/40 e 45%/55%;
- recuperação paralela vinculada ao quantitativo abaixo de 60% do próprio máximo;
- original, paralela, valor considerado, ganho, cobertura e achados preservados.

### Persistência

- contratos de entidades e resultados;
- portas independentes do fornecedor;
- schema D1 local 0001–0003;
- catálogo relacional de streams por fonte lógica;
- adaptador D1 local de leitura;
- executor abstrato que valida o plano, aplica somente versões autorizadas e exige rollback em conflito.

Ainda não existem persistência acadêmica operacional, adaptador D1 de escrita, binding, endpoints autorizados, recuperação final, resultado anual ou área HeroUI de Auditoria.

## Adaptação de contrato em andamento

A migration 0003 e a leitura local já representam a associação fonte lógica ↔ stream acadêmico. Porém, a porta de unidade de trabalho, o plano de reconciliação e o executor ainda não possuem uma operação explícita para **versionar essa associação durante a promoção**.

A #243 corrige isso antes da escrita física. A associação não pode ser um efeito colateral escondido do adaptador, nem ser inferida por nome de arquivo ou varredura de JSON.

## Validação da fonte

A suíte pública sintética cobre D1, D2, D3, VG, trimestres, REC, estados especiais de célula, posições históricas, transferências, lotes de 1/20/50 arquivos, hash e falha isolada. O procedimento `REAL_DATA_VALIDATION.md` define como conferir o corpus real fora do Git.

A execução controlada desse procedimento ainda precisa ser registrada antes do fechamento definitivo da F1. Isso não bloqueia a sétima onda.

## Saúde e limites

A #220 registra a futura área global `Centro de Administração → Configurações → Saúde e limites`. Ela permanece planejada até existirem bindings D1, uso real e backend autorizado de métricas. O painel não pertence exclusivamente ao Banco de Notas.

## Fontes de referência revisadas

- `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado.docx`;
- `PAINEL DESEMPENHO.docx`;
- `BANCO DE NOTAS 2026.xlsb`;
- planilhas reais de professores de 2026 usadas em validação controlada.

Esses arquivos não devem ser adicionados ao repositório público quando contiverem dados reais. As decisões e os contratos derivados ficam registrados neste diretório.

## Leitura obrigatória do agente

1. `AGENTS.md`;
2. [`COMECE_AQUI.md`](COMECE_AQUI.md);
3. [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml);
4. [`DECISIONS.md`](DECISIONS.md);
5. a issue atribuída;
6. [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTRACTS.md`](CONTRACTS.md), [`SOURCE_CONTRACT.md`](SOURCE_CONTRACT.md), [`D1_SCHEMA.md`](D1_SCHEMA.md) e [`TEST_MATRIX.md`](TEST_MATRIX.md) conforme o escopo;
7. [`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md).

A issue deve ser executada diretamente. App Factory, Factory Runs, orquestradores e agentes auxiliares só podem ser usados quando a própria issue autorizar expressamente.

## Regra de publicação

Uma entrega independente e utilizável não espera o restante do sistema. Depois de testes, revisão e merge na `main`, o workflow oficial publica no Cloudflare Pages. Funcionalidade incompleta só pode ser integrada quando não quebra a aplicação e permanece inacessível até cumprir os critérios de aceite.

## Regra de segurança

O repositório é público. Nunca usar dados reais de estudantes em fixtures, screenshots, logs, issues, pull requests ou commits. Arquivos reais servem apenas para validação controlada fora do repositório; resultados publicados devem ser agregados ou anonimizados.
