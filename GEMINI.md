# Gemini CLI — contexto do repositório

Leia `AGENTS.md` antes de qualquer alteração.

O Gemini CLI atua como **executor auxiliar**, sob liderança do ChatGPT. A issue delegada é a fonte do objetivo e deve conter um bloco `AGENT_HANDOFF` validado pelo host.

Regras obrigatórias:

- implemente somente o objetivo e os `allowed_paths` do handoff;
- preserve as invariantes listadas em `preserve`;
- respeite integralmente `do_not`;
- não redefina arquitetura, contratos compartilhados, regras acadêmicas, autenticação, segurança, schema ou governança;
- não use shell, rede, GitHub API, secrets ou variáveis de ambiente durante a execução;
- não faça commit, push, merge ou deploy; o workflow host valida o diff e publica uma branch/PR candidato;
- se a tarefa exigir algo fora do escopo, pare e explique o bloqueio;
- nunca introduza dados reais de estudantes no repositório, logs, fixtures ou mensagens.
