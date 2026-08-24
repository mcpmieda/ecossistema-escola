# Protocolo de validação e liberação de módulos

Este documento define como novos módulos do `mcpmieda/ecossistema-escola` devem ser validados e quando podem ser liberados oficialmente aos usuários.

## Princípio

O endereço oficial da plataforma é `https://admin.escolaieda.com`.

Quando for seguro, módulos novos devem ser validados preferencialmente **no próprio domínio oficial**, sem exigir uma URL de preview separada. Durante essa fase, estar implantado não significa estar oficialmente liberado.

O módulo em validação deve permanecer protegido por uma combinação adequada de:

- feature flag;
- papel `ADMINISTRADOR` ou papel específico de testador;
- allowlist de usuários quando necessário;
- ocultação da navegação definitiva;
- bloqueio de operações destrutivas ou gravações reais quando o risco exigir.

Professor, aluno, apoio, visitante ou outro público definitivo não deve ganhar acesso apenas porque o CI está verde ou porque a rota já existe em produção.

Preview separado continua permitido quando isolamento, segurança, dados ou natureza da mudança exigirem.

## Comando oficial de liberação

A frase exata:

`APROVADO PARA PRODUÇÃO`

significa que o usuário aprovou a **candidata atualmente apresentada para validação** e autoriza sua liberação oficial, sujeita aos gates técnicos obrigatórios.

A palavra isolada `aprovado`, `ok`, elogios ou aprovação de uma ideia/tela não devem ser interpretados como liberação de produção quando houver ambiguidade.

## Antes do comando

O módulo pode estar acessível em `admin.escolaieda.com/<rota>` somente para validadores autorizados, mas deve continuar em estado de teste controlado.

A implementação deve registrar de forma recuperável:

- módulo e versão/candidata em validação;
- rota;
- papéis/testadores autorizados;
- feature flags temporárias ou permanentes;
- operações bloqueadas durante a validação;
- critérios de aceite e regressão aplicáveis.

## Depois de `APROVADO PARA PRODUÇÃO`

O agente deve avançar autonomamente com o release da candidata aprovada:

1. confirmar que a candidata atual é a mesma apresentada ao usuário;
2. verificar se não houve mudança material posterior que invalide a aprovação;
3. executar regressão, segurança, autorização, migrations, compatibilidade e demais gates aplicáveis;
4. aplicar as permissões e feature flags definitivas previstas;
5. remover somente restrições e artefatos temporários de teste que ficaram obsoletos;
6. preservar feature flags, rollback e controles permanentes que ainda tenham função real;
7. integrar na `main` conforme o fluxo vigente;
8. deixar o GitHub Actions executar CI e deploy no Cloudflare;
9. validar o módulo em `https://admin.escolaieda.com` após o deploy;
10. confirmar que usuários não autorizados continuam bloqueados;
11. atualizar documentação, estado e evidências;
12. executar limpeza/Change Hygiene para não deixar código temporário, flags abandonadas ou implementações concorrentes.

A aprovação do usuário não transforma falha técnica em sucesso. Gate obrigatório com falha deve ser corrigido e novamente validado antes da liberação.

## Limites

`APROVADO PARA PRODUÇÃO` não autoriza:

- criar regra de produto não apresentada;
- ampliar permissões além do especificado;
- introduzir custo novo;
- ignorar falha de segurança ou integridade;
- executar migração destrutiva nova fora do escopo aprovado;
- liberar alterações materiais feitas depois da aprovação sem nova validação quando afetarem comportamento, dados, segurança ou experiência.

## Aprovação stale

Se depois da aprovação ocorrer mudança material em regra, fluxo, dados, autorização, segurança, integração ou comportamento observável, a aprovação anterior não deve ser reutilizada silenciosamente.

Correção puramente técnica que preserve integralmente o comportamento aprovado pode seguir após regressão proporcional, desde que exista evidência de que a candidata funcional não mudou.

## Regra de continuidade

Futuros agentes devem interpretar este protocolo junto da documentação de arquitetura e da App Factory. O comando humano deve continuar simples:

`APROVADO PARA PRODUÇÃO`

Toda a complexidade de release, CI/CD, segurança, flags, limpeza e validação pertence à automação e à documentação do repositório, não ao usuário.
