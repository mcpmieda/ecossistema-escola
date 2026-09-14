# Composição do Portal — #757

Entradas reais: src/student-portal e Painel do Aluno no shell, manifesto e pesquisa existentes do Centro. Portal sempre 2026; identidade e capabilities vêm de /api/me, sem nova autorização no browser. Scope e clientes estáveis evitam remontar editores a cada render.

## Provas

- student-entry.test.tsx: QR/StrictMode, ativação simulada por transporte tipado, mesma Self para Perfil/notas, cancelamento, saída falha e repetida, limpeza antes do histórico e sessão fresca.
- admin-entry.test.tsx: identidade/capabilities/expiração/headers/401/403/503, resposta tardia, limpeza de dados e ano BN sem influência, manifesto e pesquisa.
- transport-composition.test.ts: diretiva no-store exata dentro do header composto do Pages; rejeita equivalentes falsos. As entradas montadas habilitam o cooldown de Retry-After sem retentar automaticamente nem guardar bytes de comando.
- composition.postgres.ts: três provas por Pages completo → bindings reais → workerd → PostgreSQL restrito. Identidade selada sintética, negativas de origem/perfil/ano, nascimento e calendário inventados, QR, ativação, sessões persistente/curta, publicação pelo cron real, leitura autorizada somente T1, revogação, logout e fronteiras dos documentos públicos.

O teste composto encontrou duas incompatibilidades antes da publicação: header Cache-Control composto rejeitado pelos clientes e array UUID de sessions-read V2 serializado incorretamente por postgres.js. A leitura exige no-store por diretiva, e a lista SQL limitada usa JSON textual expandido no servidor, sem alterar DTO/ACL/predicado/query budget.

Executar npm run verify e, em uma base PostgreSQL nova e descartável portal705_test, npm run test:student-portal-postgres com PORTAL_TEST_DATABASE_URL. O pipeline inclui a nova composição. O guard exige postgres:// em 127.0.0.1 e o nome exato da base. As suites de runtime precisam de schema novo; não repetir contra produção nem interpretar um banco já semeado como prova de instalação limpa.

## Verificação visual da candidata

Executada no IAB/CUA com build de produção, handlers e SQL reais, dados inventados e bootstrap SharePoint sintético: oito áreas, catálogo com turma vazia, pesquisa do Centro até Publicação, ficha/nascimento/sessões/auditoria, Publicação → Configurações com a mesma turma, ficha → reimpressão da mesma conta e geração de PNG. Entrada do aluno por imagem QR local → senha sintética existente → sessão curta → Perfil/T1/parciais oficiais → saída → recarga anônima. A 320px, clientWidth=scrollWidth=305 em ambas as entradas; a tabela de notas mantém sua rolagem interna. Nenhuma câmera real, widget produtivo ou impressão física foi homologado.

O helper manual preview-local-v1.ts atende apenas 127.0.0.1:4182/4183 e exige o mesmo banco descartável. Ele usa o último aluno inventado pela prova composta e reimprime o QR existente; não cria sessão estudantil por fora do fluxo. Compile com esbuild --bundle --platform=node --format=esm --packages=external e saída dentro de node_modules/.cache/student-portal-integration, depois execute com Node. É uma ferramenta de teste sem entrada/import em produção. O arquivo /synthetic-card.png existe apenas no helper local. Os headers produtivos são preservados; o browser gerenciou o cookie no loopback, o que não prova o domínio HTTPS real.

## Evidência e limites

Antes do verify final: 64 testes focados e 3 provas compostas PASS; PostgreSQL 18.6 local, Node 24.16.0. As demais suites compostas nativas passaram 2 + 1 + 16. A primeira tentativa de carga usou limite local de 30 conexões e esgotou o pool; repetida com 100, obteve 54/55, com p95 de login 2193ms acima do gate 1500ms. Não houve relaxamento do gate. A prova de carga integral deve passar no CI PostgreSQL 17.6 no head final; resultados, SHA, publicação e eventual repetição ficam no handoff da issue. Estes números não substituem o verify/CI exigido.

G-B segue PARCIAL. #758 recebe qualidade e regressões integradas; #759 recebe Entra/Turnstile/dispositivo/impressão e dados/calendário legítimos. Nenhuma alteração produtiva de nascimento, acesso, população, publicação acadêmica ou reset foi feita. Rollback segue o workflow oficial com código compatível, preservando chaves, schema e revogações. Ao terminar QA, fechar abas, restaurar viewport e encerrar apenas helpers/cluster próprios.
