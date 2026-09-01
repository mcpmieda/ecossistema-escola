# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — qual issue pode ser executada agora.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, progresso e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.

## Estado atual

Oito ondas foram integradas. A mais recente entregou:

- #245/PR #258 — escrita e promoção transacional D1 local;
- #254/PR #259 — regressões de isolamento da reconciliação restauradas;
- #255/PR #260 — resultado anual, elegibilidade básica e precedência formal explícita.

O código funcional vigente da onda está no commit `ee0518c98682665c4ee8f32a639abbd893872f40`; o deploy Cloudflare Pages `33491736646` foi concluído com sucesso.

A nona onda está pronta para três agentes independentes:

- [#261 — runtime D1 local/preview e runner autorizado](https://github.com/mcpmieda/ecossistema-escola/issues/261);
- [#262 — contexto acadêmico global e perfil 2026](https://github.com/mcpmieda/ecossistema-escola/issues/262);
- [#263 — equivalência anual fonte × motor](https://github.com/mcpmieda/ecossistema-escola/issues/263).

A integração fica reservada à [#264](https://github.com/mcpmieda/ecossistema-escola/issues/264).

## Correção realizada na conferência

O PR #248 reunia as issues #242 e #244. O conteúdo funcional estava validado, mas o formato contrariava a regra de uma issue e um PR por entrega. Ele foi fechado sem merge e substituído por #252 e #253, mantendo os mesmos arquivos funcionais separados e novamente validados.

A revisão da #243 identificou cenários herdados de isolamento sem cobertura explícita após a reorganização dos testes. A #254 restaurou lote misto, falha isolada, determinismo e zero writes indevidos sem revelar defeito funcional.

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
- recuperação final com corte anual 60, limites 18/18/24 e substituição obrigatória mesmo quando menor;
- resultado anual com limites 59,9/60/60,1, aprovação direta/pós-REC, contagem 0/1/2/3+ e precedência somente de decisão formal registrada.

A autoridade continua `imported-source`. O motor permanece separável e comparável; não assume a nota oficial silenciosamente.

### Persistência e reconciliação

- Cloudflare D1 aprovado como armazenamento físico;
- portas independentes do fornecedor;
- migrations locais 0001–0003 e 21 tabelas;
- adaptadores locais de leitura e escrita;
- planejamento idempotente de reimportação;
- executor transacional abstrato exercitado contra a promoção D1 local;
- associação fonte lógica ↔ stream representada nas portas, plano, estimativa, executor e transação física;
- regressões de isolamento por arquivo restauradas.

Ainda não existem banco/binding D1 operacional, migration remota, runner/runtime autorizado ou persistência no site. A implementação D1 continua local e descartável.

## Próximas entregas

```text
#261 → runtime D1 local/preview + runner autorizado
#262 → contexto acadêmico global e perfil 2026
#263 → equivalência anual fonte × motor
       ↓
integração #264
```

Nenhuma dessas issues autoriza provisionamento de produção, migration remota silenciosa ou mudança da autoridade `imported-source`.

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
