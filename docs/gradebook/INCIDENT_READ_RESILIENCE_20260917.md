# Leituras resilientes — incidente informado em 17/09/2026 às 12:54 BRT

Issue #839. Esta entrega substitui somente a frequência V6 descrita no checkpoint #815 de `PERFORMANCE_ANALYTICS_V6.md`; demais contratos permanecem. Base examinada: `e239edc37aecbb43b77b6d5487c50abc77b500ef`.

## O que os sintomas demonstram

O timeout do navegador, a falha da área React e o aviso de última leitura são sintomas distintos. O último aviso representa falha de uma revalidação com snapshot anterior preservado no mesmo escopo. Não prova perda de notas, saturação do PostgreSQL ou causa atribuível a uma publicação. Não há captura do erro original do navegador nem logs de tráfego/CPU da conta Cloudflare para 15:54 UTC. A causa inicial continua não comprovada.

## Mudanças limitadas

- Analytics V6 (o leitor compartilhado de indicadores de Desempenho e consumidores que o reutilizam) passa de fallback de 30s para 120s, mais até 1s de dispersão. Abertura, seleção de contexto, invalidação de mudanças e retorno à página permanecem. Outros leitores, inclusive Portal e Conselho, conservam seus intervalos. A redução de 120 para 30 consultas por hora por leitor é nominal, em uma aba visível sem eventos, ignorando duração das respostas e dispersão; não é medição de economia financeira/CPU nem redução de 75% de todo o aplicativo.
- Um único agendador continua responsável pela revalidação. Eventos de foco/retorno não enfileiram nova leitura se uma estiver em curso; mudanças confirmadas ainda enfileiram uma revalidação coalescida. Eventos têm dispersão de 0–999ms e foco respeita intervalo mínimo de 10s. Revalidação continua pausada oculto/offline.
- O agendador reconhece rejeição ou resultado interno `false` de um leitor, respeita a espera mínima mesmo após eventos e aumenta a pausa até cinco minutos. Analytics V6 passa a devolver esse resultado após sua falha tipada. Resultado `undefined` mantém compatibilidade dos outros consumidores; não afirmar backoff tipado onde o consumidor ainda absorve uma falha sem sinalizá-la. Sucesso reinicia a cadência normal.
- Clientes somente leitura de Desempenho V2/V5/V6 têm prazo total de 30s, incluindo corpo da resposta, cancelamento em mudança de contexto e limpeza do temporizador/listener. A UI pode encerrar a espera e preservar a última leitura. Abortar `fetch` não comprova cancelamento da consulta SQL no servidor. Nenhuma escrita é repetida.
- Boundary externo diferencia categoria de carga de módulo de erro de renderização e registra apenas categoria/horário no console local, sem conteúdo acadêmico, URL de arquivo ou mensagem bruta. Isso não constitui monitoramento durável. Recarregamento é manual e respeita o guard de navegação existente; não há recarga automática nem promessa de recuperar rascunhos já perdidos por uma falha de renderização.
- Apenas `/` e `/index.html` estáticos recebem `Cache-Control: no-cache`, para revalidar o documento na navegação/recarregamento. Isso não recarrega abas abertas nem garante retenção de arquivos antigos. `no-store`, autenticação e contratos das APIs permanecem intactos.

## Concorrência e integridade

Nenhuma mudança em cálculos, notas, imports, schema, SQL, autoridade, CAS, idempotência, publicação acadêmica ou configuração de infraestrutura. Snapshots continuam isolados por ano/turma/período/epoch da sessão e são eliminados na perda de autorização. Seleções e rascunhos continuam sob os gates e guardas existentes. A aba mais antiga em outro dispositivo pode depender do fallback de até aproximadamente dois minutos para Analytics; isso não é push instantâneo entre dispositivos.

## Validação e limitações

Testes sintéticos novos cobrem intervalo pesado, cadência interativa preservada, foco durante consulta, falhas tipadas/rejeitadas, cooldown com eventos, limite de cinco minutos, limpeza, cancelamento, transporte V2/V5/V6 e corpo HTTP sem conclusão. Regressões existentes continuam cobrindo última leitura, resposta atrasada, escopo e autorização.

A entrega depende de `npm run verify` e do gate PostgreSQL/isolamento no head final; resultados e SHA efetivos são registrados na PR. O ambiente de edição não resolve hosts externos, não dispõe de cópia completa/dependências do repositório nem sessão autenticada de produção. Validação remota de CI não equivale a smoke visual/autenticado ou teste de carga real. O risco de indisponibilidade de rede/provedor não é eliminado por esta correção.
