# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração atual:** [#256 — oitava onda](https://github.com/mcpmieda/ecossistema-escola/issues/256)
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Onda atual:** #245, #254 e #255, simultaneamente.
- **Ondas concluídas:** primeira à sétima.
- **Armazenamento aprovado:** Cloudflare D1, conforme #200.
- **D1 atual:** migrations 0001–0003, leitura local e contratos transacionais; nenhum banco/binding remoto.
- **Saúde e limites:** #220 planejada no Centro de Administração.

## Fases

| Fase | Issue | Estado | Progresso objetivo | Resultado esperado no site |
|---|---:|---|---:|---|
| F0 — Fundação e coordenação | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada | 7/7 | Base para agentes |
| F1 — Fonte e importação | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Validação final pendente | 6/7 | Importação confiável e rastreável |
| F2 — Modelo e persistência | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Em construção | 5/6 | Dados disponíveis após recarregar |
| F3 — Motor nativo | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Em construção | 6/7 | Comparação fonte × cálculo nativo |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Em construção | 5/6 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Planejada | 0/7 | Aluno, turma, professor e componente |
| F6 — Desempenho | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Planejada | 0/6 | Matriz analítica da turma |
| F7 — Conselho | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada | 0/7 | Fluxo operacional do Conselho |
| F8 — Boletins e relatórios | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Planejada | 0/6 | Prévia, PDF, versões e relatórios |
| F9 — Piloto e produção | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal | 0/7 | Operação institucional validada |

## Sétima onda integrada

| Issue | Resultado | PR/merge |
|---:|---|---|
| [#242](https://github.com/mcpmieda/ecossistema-escola/issues/242) | Paralela + composição + nota/percentual trimestral | #252 / `b41054a` |
| [#243](https://github.com/mcpmieda/ecossistema-escola/issues/243) | Associação explícita nas portas, plano, estimativa e executor | #249 / `40dd21c` |
| [#244](https://github.com/mcpmieda/ecossistema-escola/issues/244) | Recuperação final, limites 60/18/18/24 e total pós-REC | #253 / `fa62bdd` |

O código vigente foi publicado pelo deploy `33456232765`. Não houve nova tela.

## Correções da conferência

### PR combinado

O PR #248 continha simultaneamente #242 e #244. Embora o código estivesse em caminhos separados e os testes passassem, isso contrariava a regra de uma issue, uma branch e um PR por entrega.

A integração fechou #248 sem merge e recriou:

- #252 — somente #242;
- #253 — somente #244.

A correção está registrada na #250.

### Cobertura de regressão

A #243 cobriu seus novos critérios, mas reorganizou testes de planejamento/execução e deixou alguns cenários herdados sem verificação explícita. Nenhuma falha funcional foi observada e o `npm run verify` passou, porém a cobertura será restaurada pela #254 antes do fechamento da F4.

## Oitava onda — pronta para agentes

1. [#245 — adaptador D1 local de escrita e promoção transacional](https://github.com/mcpmieda/ecossistema-escola/issues/245)
   - Implementa compare-and-set e commit/rollback local sobre as migrations 0001–0003.
   - Não cria banco, binding ou recurso remoto.

2. [#254 — regressões de isolamento da reconciliação](https://github.com/mcpmieda/ecossistema-escola/issues/254)
   - Restaura testes de lote misto, falha isolada, determinismo e zero writes indevidos.
   - Não altera código de produção.

3. [#255 — resultado anual, elegibilidade e precedências V1](https://github.com/mcpmieda/ecossistema-escola/issues/255)
   - Implementa 59,9/60/60,1 e contagem de 0/1/2/3+ componentes não aprovados.
   - Não automatiza a decisão humana do Conselho.

A integração será feita por [#256](https://github.com/mcpmieda/ecossistema-escola/issues/256).

## Dependências principais

```text
#242 + #244 ──> #255
#243 ─────────> #245
#249/revisão ─> #254

#245 + #254 + #255 ──> integração #256

#245 ──> binding/preview D1 + contexto anual
#255 ──> equivalência anual fonte × motor
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
