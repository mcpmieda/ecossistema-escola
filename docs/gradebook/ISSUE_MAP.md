# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração atual:** [#264 — nona onda](https://github.com/mcpmieda/ecossistema-escola/issues/264)
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Onda atual:** #261, #262 e #263, simultaneamente.
- **Ondas concluídas:** primeira à oitava.
- **Armazenamento aprovado:** Cloudflare D1, conforme #200.
- **D1 atual:** migrations 0001–0003, leitura/escrita local e promoção transacional; nenhum banco/binding remoto.
- **Saúde e limites:** #220 planejada no Centro de Administração.

## Fases

| Fase | Issue | Estado | Progresso objetivo | Resultado esperado no site |
|---|---:|---|---:|---|
| F0 — Fundação e coordenação | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada | 7/7 | Base para agentes |
| F1 — Fonte e importação | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Validação final pendente | 6/7 | Importação confiável e rastreável |
| F2 — Modelo e persistência | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Em construção | 5/6 | Dados disponíveis após recarregar |
| F3 — Motor nativo | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Núcleo V1 completo | 7/7 | Comparação fonte × cálculo nativo |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Núcleo transacional completo | 6/6 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Planejada | 0/7 | Aluno, turma, professor e componente |
| F6 — Desempenho | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Planejada | 0/6 | Matriz analítica da turma |
| F7 — Conselho | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada; elegibilidade integrada | 0/7 | Fluxo operacional do Conselho |
| F8 — Boletins e relatórios | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Planejada | 0/6 | Prévia, PDF, versões e relatórios |
| F9 — Piloto e produção | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal | 0/7 | Operação institucional validada |

## Oitava onda integrada

| Issue | Resultado | PR/merge |
|---:|---|---|
| [#245](https://github.com/mcpmieda/ecossistema-escola/issues/245) | Escrita D1 local, CAS, savepoints e promoção atômica | #258 / `d254e94` |
| [#254](https://github.com/mcpmieda/ecossistema-escola/issues/254) | Isolamento, lote misto, determinismo e zero writes indevidos | #259 / `f18ccc7` |
| [#255](https://github.com/mcpmieda/ecossistema-escola/issues/255) | Resultado anual, 0/1/2/3+ e precedência formal | #260 / `ee0518c` |

O código funcional vigente foi publicado pelo deploy `33491736646`. Não houve nova tela nem persistência remota.

## Correções da conferência

### PR combinado

O PR #248 continha simultaneamente #242 e #244. Embora o código estivesse em caminhos separados e os testes passassem, isso contrariava a regra de uma issue, uma branch e um PR por entrega.

A integração fechou #248 sem merge e recriou:

- #252 — somente #242;
- #253 — somente #244.

A correção está registrada na #250.

### Cobertura de regressão

A #243 cobriu seus novos critérios, mas reorganizou testes de planejamento/execução e deixou cenários herdados sem verificação explícita. A #254 restaurou essa cobertura contra a porta oficial de associação; nenhum defeito funcional foi encontrado.

## Nona onda — pronta para agentes

1. [#261 — runtime D1 local/preview e runner autorizado](https://github.com/mcpmieda/ecossistema-escola/issues/261)
   - Conecta o adaptador local a runtime injetado, migrations ordenadas e backend com capability.
   - Não cria banco, binding ou migration de produção.

2. [#262 — contexto acadêmico global e perfil 2026](https://github.com/mcpmieda/ecossistema-escola/issues/262)
   - Consolida ano/perfis e materializa leitura/versionamento local do contexto.
   - Não cria seletor visual nem recurso remoto.

3. [#263 — equivalência anual fonte × motor](https://github.com/mcpmieda/ecossistema-escola/issues/263)
   - Produz `match`, diferença esperada, divergência e não comparável com motivos.
   - Preserva `imported-source` e não automatiza o Conselho.

A integração será feita por [#264](https://github.com/mcpmieda/ecossistema-escola/issues/264).

## Dependências principais

```text
#245 ──> #261 + #262
#255 ──> #262 + #263

#261 + #262 + #263 ──> integração #264
```

## Gates manuais

- A execução controlada de `REAL_DATA_VALIDATION.md` com o corpus real continua pendente antes do fechamento definitivo da F1.
- O happy path visual do manifesto foi aprovado. Ainda faltam expansão do hash completo, observação da etapa transitória e falha isolada controlada.

Nenhum gate autoriza publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Como iniciar um agente

Entregue ao agente somente uma issue marcada `[PRONTA]` e instrua-o a:

1. ler `AGENTS.md` e `docs/gradebook/`;
2. executar diretamente, sem App Factory ou agentes auxiliares;
3. trabalhar apenas nos caminhos declarados;
4. criar branch curta e PR para `main`;
5. executar `npm run verify`;
6. publicar o handoff na própria issue;
7. não fazer merge, deploy, provisionamento ou alterar `PROJECT_STATE.yaml`.

## Critério de publicação

```text
issue → branch → PR → validação → integração → main → Cloudflare Pages → verificação
```
