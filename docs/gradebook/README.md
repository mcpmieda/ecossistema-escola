# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — qual issue pode ser executada agora.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, progresso e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.

## Estado atual

Sete ondas foram integradas. A mais recente entregou:

- #242/PR #252 — resultado trimestral nativo consolidado;
- #243/PR #249 — associação transacional explícita entre fonte lógica e stream acadêmico;
- #244/PR #253 — recuperação final nativa.

O código vigente da onda está no commit `40dd21c08336919206bafcb556d6764f5570e6f9`; o deploy Cloudflare Pages `33456232765` foi concluído com sucesso.

A oitava onda está pronta para três agentes independentes:

- [#245 — adaptador D1 local de escrita e promoção transacional](https://github.com/mcpmieda/ecossistema-escola/issues/245);
- [#254 — restauração das regressões de isolamento da reconciliação](https://github.com/mcpmieda/ecossistema-escola/issues/254);
- [#255 — resultado anual, elegibilidade básica e precedências explícitas](https://github.com/mcpmieda/ecossistema-escola/issues/255).

A integração fica reservada à [#256](https://github.com/mcpmieda/ecossistema-escola/issues/256).

## Correção realizada na conferência

O PR #248 reunia as issues #242 e #244. O conteúdo funcional estava validado, mas o formato contrariava a regra de uma issue e um PR por entrega. Ele foi fechado sem merge e substituído por #252 e #253, mantendo os mesmos arquivos funcionais separados e novamente validados.

A revisão da #243 também identificou que alguns cenários herdados de isolamento deixaram de estar explicitamente cobertos após a reorganização dos testes. Nenhuma falha funcional foi observada; a restauração da cobertura está rastreada na #254 antes do fechamento da F4.

## Objetivo

Construir um Banco de Notas funcional, modular, auditável e acessível a usuários leigos, integrado ao Centro de Administração e alimentado inicialmente pelas planilhas atuais dos professores. O sistema preserva a origem, implementa o motor nativo junto com o núcleo e publica progressivamente cada entrega independente.

## Em produção

- área `Banco de notas` no mesmo shell do Centro;
- interface HeroUI React v3;
- pesquisa global integrada;
- importação local de até 50 arquivos por lote;
- leitura sequencial de XLSB, XLSX e XLS;
- reconhecimento de turmas, alunos, disciplinas, trimestres, quantitativo, qualitativo e recuperação;
- SHA-256 calculado no navegador;
- manifesto, progresso e diagnóstico por arquivo;
- processamento somente em memória, sem persistência acadêmica.

## Núcleo já integrado

### Motor nativo

- semântica das células;
- arredondamento acadêmico;
- composição trimestral 30/30/40 e 45%/55%;
- recuperação paralela pelo quantitativo abaixo de 60% do próprio máximo;
- resultado trimestral com nota bruta, nota nativa, percentual, cobertura e achados;
- recuperação final com corte anual 60, limites 18/18/24 e substituição obrigatória mesmo quando menor.

A autoridade continua `imported-source`. O motor permanece separável e comparável; não assume a nota oficial silenciosamente.

### Persistência e reconciliação

- Cloudflare D1 aprovado como armazenamento físico;
- portas independentes do fornecedor;
- migrations locais 0001–0003 e 21 tabelas;
- adaptador local de leitura;
- planejamento idempotente de reimportação;
- executor transacional abstrato;
- associação fonte lógica ↔ stream representada nas portas, plano, estimativa e executor.

Ainda não existem banco/binding D1 operacional, migration remota, adaptador físico de escrita, endpoint autorizado ou persistência no site.

## Próximas entregas

```text
#245 → escrita/transação D1 local
#254 → regressões de isolamento restauradas
#255 → resultado anual e elegibilidade básica
       ↓
integração #256
```

Depois da #245 serão criadas issues separadas para binding/preview, runner de migrations e contexto anual. Depois da #255 será liberada a equivalência fonte × motor.

## Validação da fonte

A suíte sintética cobre D1/D2/D3, VG, trimestres, REC, estados especiais de célula, posições históricas, transferências, lotes de 1/20/50 arquivos, hash e falha isolada. O procedimento `REAL_DATA_VALIDATION.md` define a conferência privada do corpus real.

Essa execução ainda precisa ser registrada antes do fechamento definitivo da F1.

## Saúde e limites

A #220 registra a futura área global `Centro de Administração → Configurações → Saúde e limites`. Ela permanece planejada até existirem bindings D1, uso real e backend autorizado de métricas.

## Leitura obrigatória do agente

1. `AGENTS.md`;
2. [`COMECE_AQUI.md`](COMECE_AQUI.md);
3. [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml);
4. [`DECISIONS.md`](DECISIONS.md);
5. a issue atribuída;
6. [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTRACTS.md`](CONTRACTS.md), [`SOURCE_CONTRACT.md`](SOURCE_CONTRACT.md), [`D1_SCHEMA.md`](D1_SCHEMA.md) e [`TEST_MATRIX.md`](TEST_MATRIX.md) conforme o escopo;
7. [`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md).

A issue deve ser executada diretamente. App Factory, Factory Runs, orquestradores e agentes auxiliares só podem ser usados quando a própria issue autorizar expressamente.

## Segurança

O repositório é público. Nunca usar dados reais de estudantes em fixtures, screenshots, logs, issues, PRs ou commits. Arquivos reais servem apenas para validação controlada fora do Git.
