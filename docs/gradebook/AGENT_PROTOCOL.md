# Protocolo de trabalho para agentes

## 1. Antes de começar

1. Leia `AGENTS.md` e os documentos obrigatórios.
2. Confirme que a issue está `Pronta para iniciar` ou que as dependências citadas foram concluídas.
3. Verifique a `main` atual e crie uma branch curta no formato:

```text
feat/bn-<issue>-<slug>
fix/bn-<issue>-<slug>
docs/bn-<issue>-<slug>
```

4. Confirme os caminhos permitidos na issue.
5. Não assuma decisões a partir de uma conversa externa; use `DECISIONS.md`.

## 2. Contrato de uma issue executável

Toda issue de agente deve informar:

- objetivo funcional;
- resultado visível para o usuário;
- fase;
- caminhos permitidos;
- contratos consumidos;
- contratos produzidos/alterados;
- dependências;
- critérios de aceite;
- testes obrigatórios;
- itens fora do escopo;
- condição de publicação.

Se algum campo essencial estiver ausente e impedir uma implementação segura, registre a lacuna na issue em vez de inventar.

## 3. Durante o trabalho

- Faça commits coerentes e pequenos.
- Não mova arquivos centrais junto com uma alteração funcional sem necessidade.
- Não duplique tipos ou regras para evitar uma dependência legítima.
- Use dados sintéticos/anonimizados em testes.
- Preserve compatibilidade do recurso já publicado.
- Se descobrir impacto transversal, abra/solicite uma issue `[BN][CONTRATO]` ou `[BN][DECISÃO]`.
- Se uma instrução nova conflitar com decisão anterior, pare a parte conflitante e cite as decisões envolvidas.
- Não edite `PROJECT_STATE.yaml` em tarefas comuns; isso evita conflitos entre agentes paralelos.

## 4. Mudança de contrato

Uma mudança de contrato deve declarar:

```text
Contrato atual:
Descoberta:
Mudança compatível ou incompatível:
Consumidores afetados:
Adaptador/migração:
Testes:
Decisão acadêmica relacionada:
Condição para retirar compatibilidade antiga:
```

Mudanças compatíveis podem adicionar campos opcionais. Mudanças incompatíveis exigem nova versão/adaptador. Mudanças pedagógicas exigem decisão oficial antes do código.

## 5. Pull request

O PR deve:

- referenciar a issue com `Closes #...` quando concluir todo o escopo;
- listar apenas arquivos permitidos ou explicar a ampliação aprovada;
- indicar contratos alterados;
- registrar `npm run verify` e testes específicos;
- explicar o que muda no site e como testar;
- declarar explicitamente que não contém dados reais;
- não pedir merge enquanto checks estiverem falhando.

O agente de implementação não publica diretamente. O integrador revisa, corrige conflitos de integração, faz merge e acompanha o workflow de produção.

## 6. Handoff obrigatório na issue

Antes de encerrar, publique um comentário com:

```markdown
## Handoff

- Estado: concluído | parcial | bloqueado
- Branch/PR:
- Commit validado:
- Arquivos modificados:
- Contratos consumidos:
- Contratos alterados:
- Testes executados:
- Resultado observado:
- Pendências:
- Decisões ou dúvidas:
- Próxima tarefa segura:
```

A issue não deve ser fechada como concluída quando o resultado ainda depende de merge, publicação ou validação prevista nela.

## 7. Papel do integrador

Somente o integrador deve:

- coordenar alterações em arquivos centrais e contratos concorrentes;
- verificar que a `main` permanece compilável;
- acompanhar deploy e confirmar o site;
- atualizar `PROJECT_STATE.yaml`, mapa de issues e progresso das fases;
- fechar issues/fases após critérios de release;
- manter a fila `Pronta para iniciar` sem liberar tarefas bloqueadas;
- impedir regras acadêmicas duplicadas ou inferidas pela UI.

## 8. Publicação progressiva

Uma entrega independente segue:

```text
issue → branch → PR → checks → merge na main → deploy → verificação → Publicada
```

Quando uma fase possui partes independentes, cada parte utilizável pode ser publicada antes do fechamento da fase. Quando uma parte depende de outra para funcionar corretamente, ela permanece bloqueada ou invisível até a dependência ser publicada.

## 9. Limites de paralelismo

O padrão recomendado é até quatro agentes simultâneos, desde que:

- não escrevam nos mesmos arquivos centrais;
- não alterem o mesmo contrato;
- cada um tenha uma issue executável;
- exista um integrador responsável;
- a `main` seja atualizada frequentemente.

Aumentar o número de agentes sem separar caminhos e contratos aumenta retrabalho, não velocidade.