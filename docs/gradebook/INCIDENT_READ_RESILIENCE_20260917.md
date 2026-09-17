# Leituras resilientes — incidente informado em 17/09/2026 às 12:54 BRT

Issue #839 / PR #840. Execução retomada por autorização explícita de 17/09 às 16:54:35 UTC. Base examinada: `e239edc37aecbb43b77b6d5487c50abc77b500ef`. Não há alteração de dados, schema, regras acadêmicas ou infraestrutura.

## O que os sintomas demonstram

Timeout do navegador, falha da área React e aviso de última leitura são sintomas distintos. O último aviso representa falha de revalidação com snapshot anterior preservado no mesmo escopo. Não prova perda de notas, saturação do PostgreSQL nem causa atribuível à publicação. A causa inicial às 15:54 UTC continua não comprovada sem registros correlacionados.

## Mudanças limitadas

- Analytics V6 passa de fallback de 30s para 120s, mais até 1s de dispersão. Abertura, seleção de contexto, invalidação e retorno permanecem. Os outros leitores mantêm sua cadência nesta entrega. A redução nominal de 120 para 30 ciclos/h é desse leitor em uma aba visível sem eventos, não uma medição de economia total. Os 120s são contenção inicial, não a política final do pacote por eventos.
- O mesmo agendador reconhece rejeição/resultado interno `false`, respeita espera mínima mesmo depois de eventos e aumenta a pausa até cinco minutos. Analytics sinaliza suas falhas; leitores que absorvem uma falha e retornam `undefined` ainda precisam de integração própria. Sucesso reinicia a cadência normal.
- Foco/retorno não enfileiram leitura redundante enquanto há leitura pendente. Mudanças confirmadas continuam coalescidas. Dispersão de 0–999ms e intervalo mínimo de foco de 10s evitam rajadas.
- O shell envolve TODAS as áreas retidas em `LiveRefreshScopeV1`; o hook compartilhado pausa seus leitores quando a área está oculta. Um escopo ativo não reativa um ancestral inativo. Não desmonta telas, rascunhos ou gráficos, não interrompe gravações. Assinaturas retidas mantêm cooldown e nenhuma tarefa de polling fica agendada quando todos os leitores estão inativos. Retorno solicita uma conferência pelo mesmo agendador, respeitando `canRefresh` e a leitura já pendente.
- Clientes somente leitura V2/V5/V6 têm prazo total de 30s, incluindo corpo HTTP, cancelamento por contexto e limpeza do temporizador/listener. Abortar fetch não garante cancelamento SQL. Nenhuma gravação é repetida.
- Boundary externo preserva isolamento e distingue BN-CARGA/BN-TELA. Não faz logging direto, não mostra mensagem bruta/URL e não recarrega automaticamente. Botões respeitam o guard existente. Não há promessa de recuperar rascunho já destruído por erro de renderização. Registro persistente de erro pertence à entrega seguinte do pacote.
- Apenas `/` e `/index.html` estáticos recebem `Cache-Control: no-cache`, sem cache acadêmico ou alteração de `no-store`. Isso não atualiza abas abertas nem garante retenção de módulos antigos.

## Validação e correção das falhas iniciais

O head inicial `01f4b5f` falhou em três asserções: duas exigiam a identidade do sinal original mesmo com sinal derivado de prazo, e uma exigia texto/ausência de logs no boundary. A mensagem de isolamento e a proibição de logs diretos foram preservadas sem mudar o teste F9. As duas asserções de transporte passam a exigir um AbortSignal válido, complementadas por três testes que cancelam o PAI e comprovam que cada cliente real aborta o sinal efetivamente enviado a fetch e limpa temporizadores. Mantidos todos os testes de contrato, contexto, auth e no-store.

Testes sintéticos cobrem pausa/retomada, escopos aninhados, rascunho/DOM preservados, cooldown ao ocultar/retornar, guardas de formulário, prazo do corpo da resposta e falhas de transporte. Verificações completas e SHAs efetivos ficam na PR, não são presumidos por este documento.

## Limites

Uma área oculta ainda pode terminar uma leitura já iniciada, executar uma ação manual ou reagir a um efeito específico de mudança de contexto fora do scheduler. Esta entrega pausa a revalidação automática compartilhada, não todo efeito do aplicativo. Código integrado, CI, publicação, uso autenticado e homologação visual são evidências diferentes. O ambiente local desta retomada não resolveu `github.com`; a edição usa o conector autorizado e a validação completa usa o CI oficial. Não existe garantia de indisponibilidade zero.
