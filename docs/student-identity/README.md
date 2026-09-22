# Identidade compartilhada do aluno — #1114

## Contrato e limites

`studentUid` é o UUID imutável da pessoa, compartilhado entre Banco de Notas,
Portal e futuros consumidores de fotos. Não é nome, número de chamada, turma,
ID da planilha nem uma autorização de acesso.

`gradebook.aluno.id` continua sendo a chave numérica acadêmica. `account.id`
continua sendo a chave da conta/credenciais. Elas não são renumeradas. Os dois
registros passam a apontar para o mesmo `student_uid`. Para as contas já
existentes, esse valor é exatamente o UUID da conta, sem alterar fotos ou links.
Uma conta criada depois pode ter uma chave interna diferente: consumidores
transversais usam `studentUid`, nunca uma suposição de igualdade entre PKs.

Esta entrega prepara a identidade; não implementa editor, leitura HTTP de fotos,
remoção de fundo, novo fluxo de matrícula ou redesign. Não modifica os DTOs
acadêmicos antigos nem cria endpoint público ou novas permissões de pessoas.

## Persistência

Migration: `migrations/student-portal/0018_shared_student_identity_v1.sql`.

- `gradebook.student_identity(id, created_at)` é o registro durável sem dados
  pessoais duplicados e sem dependência de um ano letivo.
- `gradebook.aluno.student_uid` e `student_portal.account.student_uid` são
  obrigatórios e referenciam a identidade. Pessoa/ano são únicos em cada módulo.
- A FK composta da conta exige correspondência de aluno, ano **e** identidade.
- Triggers imutáveis preservam o UUID em correções de nome e mudanças de vínculo.
  A criação de aluno aloca a identidade mesmo sem conta; criar conta reutiliza-a.
- Backfill utiliza somente a FK já existente, não nomes. Contas encerradas
  conservam sua própria identidade, sem inferir correspondência pelo histórico.
- Encerrar o vínculo conserva `student_uid`; a guarda atual de reset continua
  válida. Excluir a linha anual não exclui o registro de identidade nem a conta.
- Reutilizar um número acadêmico depois do reset gera identidade nova, a menos
  que exista ligação explícita aprovada. Não há casamento automático entre anos.

O registro de identidade possui RLS. `gradebook_app` pode lê-lo, mas nenhum dos
papéis de runtime pode inserir, alterar ou apagar suas linhas diretamente.
`student_portal_app` não recebe acesso novo ao schema acadêmico: o trigger
estritamente delimitado resolve a ligação. As funções `SECURITY DEFINER` são
somente triggers, com `search_path=pg_catalog`, nomes totalmente qualificados e
sem EXECUTE público/de runtime. Não existe RPC com UID arbitrário para escrever.

Não alterar silenciosamente `student_uid` para reparar duplicatas. Uma futura
fusão ou confirmação de rematrícula precisa de contrato próprio, conflito
explícito, auditoria e preservação de fotos/histórico. Esta entrega não a autoriza.

## Leitura compartilhada

- Contrato: `shared/student-identity/student-identity-v1.ts`.
- Leitor: `server/student-identity/resolve-student-identity-v1.ts`.
- Até 500 referências por chamada, um ano explícito, um SELECT parametrizado.
- Origem Banco: `{source:'gradebook', academicYear, studentIds:[inteiros]}`.
- Origem Portal: `{source:'portal', academicYear, accountIds:[UUIDs de conta]}`.
- Ambos devolvem o mesmo `studentUid`; resultados mantêm a referência de origem.
- Referências inexistentes são omitidas; duplicidade, inconsistência, erro de
  schema e indisponibilidade não são mascarados como aluno sem identidade/foto.
- O chamador deve autorizar previamente operação, ano e cada aluno, usando o
  papel/conexão/transação já existentes. O leitor **não concede autorização**.
- A consulta de identidade de uma conta encerrada é possível para um chamador
  autorizado; isso não reabre conta, sessão, publicação ou acesso do aluno.

Nenhum consumidor deve converter um número acadêmico em UUID, procurar pessoa
por nome ou usar conhecimento de um UUID como prova de autorização. Na próxima
entrega de fotos, adaptar referências legadas `profile_photo.account_id` via a
conta, mantendo os identificadores dos arquivos existentes no SharePoint.

## Implantação e recuperação

O arquivo no Git **não comprova aplicação em produção**. A issue #1114 registra
separadamente código, testes, revisão, CI, autorização/aplicação de schema,
integração e publicação. Não aplicar migration só porque o arquivo existe.

1. Confirmar baseline/ausência da migration e integridade dos vínculos; registrar
   apenas contagens/checagens sanitizadas. Não publicar UUIDs nem fotos reais.
2. Validar testes de migration/contrato e importação, mais `npm run verify` e
   gates oficiais no head final. Conferir impacto no restore e ciclo anual.
3. Aplicar uma única vez em janela de escrita controlada, com autorização de
   schema correspondente. A migration é transacional, adquire o lock global do
   protocolo existente e falha por timeout em vez de esperar indefinidamente.
4. Comparar antes/depois os campos preexistentes de alunos/contas, versões,
   credenciais, sessões e referências de fotos. Confirmar zero vínculos
   divergentes, identidade em todos os registros e ACL/RLS privadas.
5. Validar consumidores antes de declarar o recurso disponível. Leitura e
   escrita de fotos continuam uma entrega seguinte; redesign fica na sua branch.

Falha dentro da transação reverte o conjunto. Depois do commit, não apagar o
registro/colunas nem regenerar UUIDs como rollback improvisado: manter o código
anterior (compatível), bloquear o consumidor novo e revisar o incidente. Um
restore deve incluir o registro de identidade antes das referências, além das
contas/fotos conforme seus procedimentos próprios; não restaurar apenas números
acadêmicos e presumir que eles identificam a pessoa anterior.

## Testes desta entrega

`tests/student-identity/identity-contract-reader-v1.test.ts`: validação de entrada,
limites, consulta única, caminhos de origem, faltantes, erro de transporte/schema,
resultado fora de escopo e ambiguidades.

`tests/student-identity/identity-migration-v1.test.ts`: schema real em PGlite,
backfill preservando campos existentes, credenciais/sessões/fotos sintéticas,
homônimos, replay, criação de aluno antes da conta, imutabilidade, FK composta,
ligação explícita entre anos, exclusão da linha anual sem perda de identidade,
reutilização de números sem herança, privilégios e importador V11 com a função
existente de população Portal. As operações SQL de fechamento/exclusão no teste
validam invariantes do banco, não substituem o smoke autenticado do reset.

Execução efetiva, SHAs, resultados e limitações são registrados na issue/PR;
a existência dos testes não é uma alegação de que já passaram.
