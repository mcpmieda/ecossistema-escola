# Monitoramento simples do Portal do Aluno

## Rotina diária

1. Entre em **Painel do Aluno → Visão geral**, use **Atualizar visão geral** e confirme **Operando normalmente**.
2. Entre em **Configurações** e confirme **População ativa** e **0 perfis ainda não criados**.
3. Observe se apareceram contas bloqueadas, vínculos não resolvidos ou trabalho pendente. Esses números podem existir legitimamente; investigue qualquer aumento inesperado.
4. Entre em **Publicação** somente quando decidir divulgar um período. A publicação é manual; a atualização automática atua apenas nos períodos que já foram publicados.
5. Em **Auditoria**, confira as operações administrativas recentes quando houver dúvida sobre bloqueio, QR, senha, nascimento, configuração ou publicação.

Faça essa consulta também depois de importar a Relação, mover alunos de turma, alterar notas já publicadas ou executar ações em lote.

## Quando algo falhar

Anote:

- data e hora aproximadas;
- endereço da tela, removendo qualquer trecho depois de `#v1.` de um QR;
- ação realizada e mensagem exibida;
- escopo geral ou nome da turma, sem nome de aluno;
- se ocorreu na primeira tentativa e se a repetição funcionou;
- estado mostrado em **Visão geral** e contagens agregadas relevantes.

Não envie QR, senha, PIN, ano de nascimento, cookie, token, chave, nome ou nota de aluno. Não envie uma captura que mostre esses dados. Se o caso for individual, chame a pessoa de “aluno afetado” e mantenha a investigação dentro do painel autenticado.

## Modelo para pedir ajuda à IA

Copie e preencha:

```text
Portal do Aluno — incidente pós-produção
Horário aproximado:
Tela/rota sem credenciais:
Ação realizada:
Mensagem exata sem dados pessoais:
Escopo: escola ou turma (sem aluno):
Primeira tentativa ou repetição:
Saúde na Visão geral:
Contagens agregadas relevantes:
Resultado esperado:
Resultado observado:
```

Peça à IA primeiro um diagnóstico sem alteração de dados. Se houver correção, solicite issue, branch, testes, revisão, deploy oficial e verificação sanitizada. Diga expressamente que nomes, notas, QR, credenciais e identificadores de alunos não podem aparecer em issue, commit, log ou captura.

## Sinais que pedem intervenção

- **Intervenção necessária** na saúde operacional;
- perfis faltantes após uma nova Relação;
- aumento de vínculos não resolvidos;
- trabalho pendente além da janela esperada, sinalizado na saúde operacional;
- erro repetido de login após uma segunda tentativa limpa;
- período confirmado como publicado que não aparece para uma conta elegível;
- conta de saída que ainda mantém sessão ou conteúdo visível.

Nesses casos, preserve o horário e a mensagem, evite repetir ações destrutivas e abra uma issue específica. O acesso geral pode ser desligado em **Configurações** enquanto o diagnóstico ocorre; isso não apaga contas, notas ou histórico.
