# Runtime D1 retirado: memoria da #1079

Autorizacao explicita do responsavel em 21/09/2026, contrato #1079 e
BN-DEC-041. Baseline anterior: `58d5f399b288663eb083a0b4c4aae11bc48e4385`.

Este diretorio nao participa de runtime, build ou descoberta de testes. Exclua
`Aprendizados/**` da busca por consumidores operacionais. Testes ativos podem
ler esta memoria como texto, mas nunca importar ou executar seus modulos.

Foram preservados, sem alterar o conteudo, 34 arquivos do runtime D1, seis
migrations SQL D1 e 35 fixtures/testes exclusivos desse runtime (75 arquivos;
SHA-256 antes/depois conferido). As tres fachadas PostgreSQL anteriores tambem
foram copiadas antes da retirada do tradutor. Testes especificos do tradutor
podem acompanhar esta memoria; os testes PostgreSQL atuais usam a porta nativa.

Os caminhos relativos antigos nao sao um pacote executavel isolado. Para
reproduzir o ambiente historico, consulte o checkout da baseline no Git, sem
reintroduzir dependencias deste arquivo historico no runtime atual.

Nao houve execucao de migrations, DDL/DML remoto, copia de dados reais,
alteracao de schema, grants, RLS, secrets ou infraestrutura. As migrations
atuais em `migrations/gradebook-simplified`, `migrations/gradebook-postgres` e
`migrations/student-portal` nao fazem parte desta retirada.

Os contratos compartilhados, dominio, calculos e PDF ainda reutilizados foram
preservados. Apos autenticacao, autorizacao e validacao, os transportes retirados
recebem HTTP 410 com seu DTO `unavailable`, sem abrir banco. Os consumidores
atuais e seus testes permanecem fora deste diretorio.

Evidencias de CI, merge, deploy e limites de smoke ficam na issue #1079. A
presenca deste documento nao significa, sozinha, publicacao em producao.
