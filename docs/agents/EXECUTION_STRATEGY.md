# Estratégia de execução multiagente

Esta política complementa o `AGENTS.md`. O objetivo é reduzir o tempo total de entrega sem fragmentar a arquitetura ou criar revisões redundantes.

## Princípio

O agente líder decide o plano de execução e pode, sem nova confirmação por tarefa:

- trabalhar sozinho;
- delegar uma subtarefa;
- dividir uma entrega em frentes paralelas;
- pedir revisão independente;
- solicitar correção ao mesmo executor;
- interromper ou trocar um agente;
- integrar os resultados quando os gates permitirem.

A decisão deve otimizar **latência, qualidade, custo/cota e risco de integração**.

## Papéis preferenciais

Os papéis são preferências operacionais, não exclusividades.

### Gatilhos operacionais homologados

- **Antigravity:** comentário exato `/antigravity` ou `workflow_dispatch`; exige issue do proprietário com `AGENT_HANDOFF`.
- **OpenHands Cloud:** comentário exato `/openhands` ou `workflow_dispatch`; exige issue do proprietário com `AGENT_HANDOFF`.
- **Gemini CLI:** comentário exato `/gemini` ou `workflow_dispatch`; exige issue do proprietário com `AGENT_HANDOFF`.
- **CodeRabbit:** `@coderabbitai review` quando uma segunda leitura trouxer valor.
- **SonarQube Cloud:** Automatic Analysis via GitHub App; não requer scanner/token no workflow normal.
- **Jules:** acionamento pela integração Jules/GitHub conforme a tarefa delegada.
- **ChatGPT:** coordena as frentes, integra evidências e decide qual executor usar dentro das autorizações existentes.

| Papel | Ferramenta/agente preferencial | Uso |
| --- | --- | --- |
| Liderança técnica | **ChatGPT** | arquitetura, regra acadêmica/negócio, contratos, dados, segurança, delegação e integração final |
| Implementação assíncrona ampla | **Jules** | correções e funcionalidades delimitadas com acesso ao repositório e ciclo próprio de implementação |
| Implementação bounded/paralela | **Antigravity** | pacotes bem especificados, testes, refatorações e consumidores independentes via `/antigravity` |
| Implementação cloud assíncrona | **OpenHands Cloud** | tarefas delimitadas que se beneficiem de workspace cloud e execução longa via `/openhands` |
| Implementação bounded via CLI | **Gemini CLI** | alterações rápidas em `allowed_paths`, com patch validado host-side e PR candidato via `/gemini` |
| Revisão independente | **CodeRabbit** | encontrar regressões, inconsistências e pontos de atenção em PRs quando a revisão acrescentar valor |
| Qualidade/segurança especializada | **SonarQube Cloud** | análise estática e Quality Gate automáticos; não é autoridade arquitetural |
| Futuros agentes | conforme homologação | recebem um papel pelo agente líder antes de entrar no fluxo |

## Escolha do caminho

### 1. Mudança pequena

Exemplos: texto, condição local, teste quebrado conhecido, tipagem simples, ajuste CSS isolado.

Fluxo:

1. um único agente executa;
2. teste direcionado;
3. PR/CI final;
4. merge quando verde.

Não abrir duas implementações nem esperar revisão de vários agentes sem motivo.

### 2. Mudança média e autocontida

Exemplos: componente, endpoint, serviço ou correção com alguns arquivos.

Fluxo:

1. líder define invariantes e escopo;
2. um executor implementa em paralelo com outra atividade útil do líder;
3. executor roda testes direcionados;
4. revisão independente somente se risco justificar;
5. CI final.

### 3. Mudança grande separável

Exemplo: núcleo + Portal + testes + documentação.

Fluxo:

1. líder define contrato/fonte de verdade primeiro;
2. uma frente por responsabilidade e, de preferência, por paths não sobrepostos;
3. no máximo dois executores de código simultâneos por padrão;
4. líder continua trabalho em outra frente em vez de aguardar;
5. resultados são integrados na ordem das dependências;
6. full verify/CI no head final.

### 4. Mudança crítica

Inclui regra acadêmica, schema/migration, autenticação/autorização, segurança, contrato compartilhado, produção e arquitetura transversal.

Fluxo:

1. líder toma a decisão técnica;
2. executor(es) podem implementar partes já especificadas;
3. pelo menos uma verificação independente proporcional ao risco;
4. líder revisa especificamente invariantes e interfaces críticas;
5. CI/gates oficiais;
6. integração controlada.

## Regra de único escritor

Cada preocupação possui um escritor principal por vez.

Dois agentes só implementam a mesma coisa quando:

- há comparação deliberada entre abordagens;
- o primeiro executor ficou bloqueado;
- a incerteza técnica é grande o suficiente para justificar duas provas independentes.

Fora disso, duplicação é desperdício.

## Regra de não espera

Depois de disparar Jules, Antigravity, OpenHands Cloud, Gemini CLI, CI ou outra operação demorada, o agente líder deve procurar a próxima frente independente que possa avançar.

Esperar é aceitável somente quando o resultado pendente determina a próxima decisão e não existe trabalho seguro paralelo.

## Verificação sem gargalo

Qualidade é distribuída:

- executor: testes direcionados e evidências do próprio escopo;
- revisor independente/ferramenta: segunda leitura quando útil;
- CI: gates objetivos do head final;
- agente líder: arquitetura, contratos, regras, segurança, dados e integração transversal.

Não repetir a mesma verificação em todos os níveis apenas para produzir a mesma evidência.

## Ampliação de escopo

O agente líder pode ampliar o escopo de um executor quando concluir que ele tem capacidade para a tarefa e o ganho de velocidade compensa.

Continuam fora dessa autorização automática:

- secrets e credenciais;
- branch protection/rulesets;
- permissões de terceiros;
- mudanças de produção sem os gates próprios;
- alteração da própria governança de agentes por um executor;
- instalação/conexão de novo serviço externo que exija nova autorização do responsável.

Quando um executor tecnicamente limitado não for adequado, prefira outro agente com a capacidade necessária a enfraquecer guardrails sem motivo.

## Critério de sucesso

A estratégia é boa quando reduz:

- tempo ocioso;
- repetição de análise;
- número de handoffs desnecessários;
- ciclos de CI causados por integração tardia;
- conflitos entre branches;

sem aumentar:

- regressões;
- duplicação de regra de negócio;
- divergência arquitetural;
- exposição de dados/secrets;
- bypass de gates.
