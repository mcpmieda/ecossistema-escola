# Fixtures de notas do Portal do Aluno

`fixtures-v1.ts` monta payloads sintéticos `SelfResponseV1` para os testes da área do aluno
(`StudentPortalWorkspaceV1`: Boletim e Disciplina). Nada aqui faz fetch, guarda dados no
navegador, calcula notas ou usa dados reais.

## Histórico

A primeira tela de notas (#750) era uma tabela, `StudentGradesV1`, com colunas por período e
largura ajustável. O redesign do Portal a substituiu pelo Boletim e pela Disciplina. Em
27/09/2026 a tabela, que já não era usada pelo app, foi removida junto com o CSS e os testes
dela. A regra da prova paralela (#848) continua coberta na tela atual, em
`tests/gradebook/performance/parallel-visibility-848-ui.test.tsx`. A evidência de QA da
tabela original está no histórico do git.
