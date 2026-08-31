# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração atual:** [#229 — quinta onda](https://github.com/mcpmieda/ecossistema-escola/issues/229)
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Onda atual:** #226, #227 e #228, simultaneamente.
- **Ondas concluídas:** primeira, segunda, terceira e quarta.
- **Armazenamento aprovado:** Cloudflare D1, conforme #200.
- **Saúde e limites:** #220 planejada no Centro de Administração.

## Fases

| Fase | Issue | Estado | Progresso objetivo | Resultado esperado no site |
|---|---:|---|---:|---|
| F0 — Fundação e coordenação | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada | 7/7 | Base para agentes |
| F1 — Fonte e importação | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Em validação final | 6/7 | Importação confiável e rastreável |
| F2 — Modelo e persistência | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Em construção | 4/6 | Dados disponíveis após recarregar |
| F3 — Motor nativo | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Em construção | 2/7 | Comparação fonte × cálculo nativo |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Em construção | 2/6 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Planejada | 0/7 | Aluno, turma, professor e componente |
| F6 — Desempenho | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Planejada | 0/6 | Matriz analítica da turma |
| F7 — Conselho | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada | 0/7 | Fluxo operacional do Conselho |
| F8 — Boletins e relatórios | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Planejada | 0/6 | Prévia, PDF, versões e relatórios |
| F9 — Piloto e produção | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal | 0/7 | Operação institucional validada |

## Entregas concluídas

| Issue | Resultado | PR/merge |
|---:|---|---|
| [#193](https://github.com/mcpmieda/ecossistema-escola/issues/193) | Esquema `SourceContractV1` | #207 / `83d7bf4` |
| [#194](https://github.com/mcpmieda/ecossistema-escola/issues/194) | Entidades acadêmicas V1 | #208 / `466717b` |
| [#195](https://github.com/mcpmieda/ecossistema-escola/issues/195) | Importador modularizado | #209 / `17ba8b1` |
| [#196](https://github.com/mcpmieda/ecossistema-escola/issues/196) | Lançamentos e resultados acadêmicos V1 | #212 / `6b8eb4c` |
| [#198](https://github.com/mcpmieda/ecossistema-escola/issues/198) | Fixtures sintéticas e protocolo privado | #213 / `32450ac` |
| [#197](https://github.com/mcpmieda/ecossistema-escola/issues/197) | Lote, reconciliação e Auditoria V1 | #216 / `0f1ba62` |
| [#201](https://github.com/mcpmieda/ecossistema-escola/issues/201) | Semântica nativa das células | #217 / `9476f84` |
| [#199](https://github.com/mcpmieda/ecossistema-escola/issues/199) | SHA-256, manifesto e proveniência visível | #225 / `bc82b35` |
| [#218](https://github.com/mcpmieda/ecossistema-escola/issues/218) | Arredondamento acadêmico nativo V1 | #224 / `dc54adc` |
| [#219](https://github.com/mcpmieda/ecossistema-escola/issues/219) | Portas de persistência e transação V1 | #223 / `65af08f` |

A mudança visual da quarta onda foi publicada pelo deploy `33429726281`.

## Onda 5 — pronta para agentes

As três issues abaixo escrevem em áreas separadas e podem ser executadas ao mesmo tempo:

1. [#226 — composição trimestral nativa V1](https://github.com/mcpmieda/ecossistema-escola/issues/226)
   - Caminhos: `src/gradebook-domain/calculations/term/**` e testes próprios.
   - Não implementa recuperação, UI ou persistência.

2. [#227 — esquema e migrations D1 V1](https://github.com/mcpmieda/ecossistema-escola/issues/227)
   - Caminhos: migrations/schema D1, documento próprio e testes locais.
   - Não cria banco/binding de produção e não altera `wrangler.jsonc`.

3. [#228 — planejador idempotente de reimportação](https://github.com/mcpmieda/ecossistema-escola/issues/228)
   - Caminhos: camada de aplicação da importação e testes de idempotência.
   - Planeja alterações; não executa writes nem associa fonte ambígua.

O integrador acompanha os três trabalhos em [#229](https://github.com/mcpmieda/ecossistema-escola/issues/229).

## Próxima onda — dependências conhecidas

| Tarefa futura | Liberação necessária |
|---|---|
| Recuperação paralela nativa | #226 integrada |
| Adaptador D1 local/preview e bindings por ambiente | #227 integrada |
| Execução transacional da reimportação | #227 + #228 integradas |
| Saúde e limites globais (#220) | D1/bindings e backend de métricas reais |

## Dependências principais

```text
#201 + #218 ──> #226
#219 + decisão #200 ──> #227
#197 + #199 + #219 ──> #228

#226 + #227 + #228 ──> integração #229

#227 ──> adaptador D1
#227 + #228 ──> promoção/versionamento persistente
#226 ──> próxima regra do motor
```

## Gates manuais

### Fonte real

A #198 entregou a massa sintética e `REAL_DATA_VALIDATION.md`. A execução controlada com o corpus real continua pendente antes do fechamento definitivo da F1.

### Smoke visual da #199

O build e o deploy passaram. Ainda é necessário um operador autenticado selecionar um arquivo no site oficial e conferir SHA-256 abreviado/completo, progresso por etapa e diagnóstico isolado. Isso não bloqueia a onda 5.

Nenhum gate autoriza publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Decisões vigentes relacionadas

- D1 é o armazenamento físico aprovado; acesso somente pelo backend.
- O domínio usa portas independentes do D1.
- Nome do arquivo não é identidade permanente.
- Mesmo hash não duplica; diferenças geram versões apenas quando o conteúdo acadêmico mudou.
- Saúde e limites pertencem ao Centro de Administração, não ao Banco isoladamente.

## Como iniciar um agente

Entregue ao agente somente uma issue marcada `[PRONTA]` e instrua-o a:

1. ler `AGENTS.md` e `docs/gradebook/`;
2. executar a tarefa diretamente, sem App Factory ou agentes auxiliares;
3. trabalhar apenas nos caminhos declarados;
4. criar branch curta e PR para `main`;
5. executar `npm run verify`;
6. publicar o handoff na própria issue;
7. não fazer merge, deploy ou alterar `PROJECT_STATE.yaml`.

## Critério de publicação

```text
issue → branch → PR → validação → integração → main → Cloudflare Pages → verificação
```

Entregas internas podem não produzir mudança visual, mas devem preservar o site e liberar a próxima dependência de forma verificável.
