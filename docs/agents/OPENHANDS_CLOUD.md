# OpenHands Cloud — integração operacional

O OpenHands Cloud é um executor assíncrono externo da equipe. Ele trabalha em sandbox na nuvem e pode abrir pull requests a partir de issues.

## Instalação

1. Entrar no OpenHands Cloud com a conta GitHub do responsável.
2. Em **+ Add GitHub Repos**, selecionar somente `mcpmieda/ecossistema-escola`.
3. Revisar as permissões solicitadas e concluir **Install & Authorize**.
4. Configurar o modelo/credencial diretamente no OpenHands Cloud. Não copiar chave de LLM para issues, documentação ou código.
5. Validar com uma issue sintética e sem dados reais.

A integração oficial usa tokens GitHub de curta duração e solicita acesso de leitura/escrita a Actions, status de commits, conteúdo, issues, pull requests, webhooks e workflows. Por esse motivo, a instalação deve permanecer restrita a este repositório e o agente não recebe autoridade adicional para integrar ou publicar produção.

## Acionamento padrão

O caminho homologado neste repositório é o workflow próprio **OpenHands Cloud on demand**:

1. o ChatGPT prepara ou revisa a issue com um bloco `AGENT_HANDOFF`;
2. o responsável/agente líder comenta exatamente `/openhands` na issue;
3. o GitHub Actions chama a API do OpenHands Cloud usando `OPENHANDS_API_KEY`, sem entregar um token GitHub gravável ao job do provedor;
4. OpenHands trabalha no repositório conectado e, quando houver alterações, entrega somente branch/PR candidato;
5. CI, Sonar e revisão proporcional ao risco continuam obrigatórios;
6. merge/deploy seguem as regras normais do repositório.

Labels públicas e menções diretas do GitHub App não são o mecanismo padrão da equipe. O gatilho oficial interno é `/openhands`, aceito somente quando escrito pelo proprietário do repositório em issue também criada pelo proprietário.

## Limites

- OpenHands é executor, não autoridade arquitetural.
- Não deve alterar `.github/**`, `AGENTS.md`, `infra/agents/**`, credenciais, rulesets ou infraestrutura sem escopo explícito do agente líder.
- Não deve receber dados reais de alunos.
- Não deve fazer merge direto em `main` nem acionar produção como parte de uma tarefa comum.
- Qualquer PR produzido é uma entrega candidata.
- Se o start-task terminar em `ERROR` antes de existir conversa executável, o host permite somente uma nova criação, usando o mesmo deadline global. Timeout, falha após início da execução e sandbox `ERROR` durante a conversa continuam fail-closed sem repetição automática.
