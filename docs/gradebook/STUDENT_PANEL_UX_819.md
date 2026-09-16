# Painel do Aluno e detalhe granular — #819 / PR #820

## Escopo e base

Pedido explícito do responsável em 16/09/2026, incluindo ambas as mensagens de correção dos screenshots e o reforço da regra de vazio/zero. Base: `main@255cf2f75c504f464aa449618965f82f3a601ddb`. Implementação direta; nenhum fluxo App Factory. O status de merge/deploy deve ser conferido na issue e no workflow, não inferido da presença deste documento.

## Observação da fonte

O Excel pode omitir o registro interno de uma célula vazia. Após reconhecer uma linha de aluno em guia trimestral, o leitor agora captura explicitamente `null` nos endereços R, S, Z e AA–AJ vazios ou omitidos. Zero numérico, digitado ou cache numérico de fórmula, permanece `0`. Erro de célula, fórmula sem cache ou fonte não lida permanece indisponível, nunca uma falta inventada. A captura só ocorre nos intervalos das linhas reconhecidas; não transforma cabeçalhos, células fora do intervalo ou instrumentos inativos em atividade não realizada.

A versão do produtor inclui `observed-blanks-v1`, permitindo distinguir a nova leitura da anterior sem alterar o conteúdo do arquivo de origem. O restante do contrato V9 e a exclusão de instrumentos qualitativos inativos permanecem os da #817. AM, REC, U, regras acadêmicas e snapshots emitidos não são reinterpretados.

Exibição granular compartilhada: vazio observado = **Não fez**; zero acadêmico = **Tirou zero**. Resultado do trimestre continua numérico. Dados descartados por leitores antigos exigem releitura autorizada das fontes; a entrega não executa reimportação nem backfill produtivo.

## Navegação, tabelas e atualização

- Turmas em `Tabs` HeroUI, catálogo completo incluindo turmas vazias; seleção compartilhada em memória entre áreas do Painel, descartada ao mudar identidade/permissões. Desempenho mantém ano global e período primeiro, seguido das turmas em abas. Nenhuma nota ou identidade é persistida no armazenamento do navegador.
- Filtros de Alunos em grade compacta, sem herdar o fluxo em coluna de `Card.Content`; filtros das demais operações explicitam direção horizontal. Tabela HeroUI, nome acionável e ficha em `Drawer` direito, com foco, Escape e proteção de rascunho.
- Coleções comuns carregam automaticamente até 1.000 registros. Volumes maiores continuam pelo cursor assinado quando o fim da lista se aproxima do viewport. Mantêm limite de 100 por resposta, eliminação de duplicatas por ID, detecção de ciclo, cancelamento e recusa de dados inválidos. Não há botões de próxima/anterior página, nem truncamento apresentado como resultado completo.
- Leituras subsequentes preservam o conteúdo durante revalidação. Paginação técnica é independente do limite de 100 alunos por emissão de PDF/QR. Anos de nascimento continuam com confirmação por linha no servidor e cursores de dados pessoais separados dos cursores das contas.
- Cursores acumulados com mais de quatro minutos são reconstruídos por leitura desde o início antes de continuar. O detalhe de notas só reposiciona a rolagem quando muda aluno, componente ou período, não a cada novo objeto retornado pelo refresh.

## Configurações e visual

Escola, turma e aluno reutilizam o mesmo editor. Switches mostram **Ativado/Desativado** e preparam a mudança diretamente; confirmação de efeito imediato, CAS e idempotência não foram removidos. Valores visíveis só mudam após confirmação do servidor. Os demais campos mantêm edição e revisão próprias.

Calendário oficial HeroUI em pt-BR abre ao clicar na data. Edição de hora, limpeza e teclado permanecem separadas. Grupos distintos: ano letivo, cada trimestre, recuperação/resultado e divulgação. Ajuda em ícone `i`, acessível também por foco/toque. Segurança apresenta durações humanas e opções válidas, preservando exatamente um valor personalizado existente. Conversão para segundos ocorre apenas no contrato.

Visão geral usa somente contagens reais existentes, com cores moderadas e ícones. Não adiciona tendências, séries temporais ou gráficos com categorias sobrepostas como se fossem partições. Animações encurtadas e redução de movimento respeitada.

## Contrato aditivo de personalizações

`settings-overrides` integra a consulta administrativa V2 existente. Resposta: `observedAt`, `items` agrupados por proprietário e `nextCursor`; cada item traz `id`, `scope`, `label`, `classLabel` e `value` parcial validado. Retorna somente campos efetivamente definidos pelo próprio escopo, excluindo anotações herdadas e padrões da escola. Filtro de turma inclui sua configuração e as personalizações de alunos vinculados; filtro de aluno não inclui outros alunos.

O cursor é vinculado a operação, consulta, escopo e administrador. O novo formato de chave de personalização não é aceito em cursores de outras operações. A execução permanece no dispatcher autenticado, somente leitura, com snapshot e limites existentes; nenhuma migration, nova tabela, ACL ou mudança de autorização. A lista abre o mesmo editor de escola/turma/aluno em ficha lateral e atualiza após confirmação.

## Validação e limitações

Regressões cobrem leitura real de planilha omitindo vazios; zero digitado e de fórmula; canônico V9; ambos os estados nas telas granulares; detalhe estável durante invalidação; turmas compartilhadas; coleções com 105 e 1.005 registros, cancelamento, cursores cíclicos, erro/autorização; nomes e isolamento de personalizações em PostgreSQL/PGlite; switches; datas/horas; unidades humanas e regras de layout.

Executar `npm run verify` e CI no head final, mais os gates PostgreSQL e o deploy oficial. A configuração temporária de workflow da entrega anterior não foi reintroduzida. Sem alterações de dependências, schema, permissões ou dados de produção.

Browser plugin não disponível. Tentativa de Playwright/Chromium no servidor local em `http://127.0.0.1:4173` retornou `net::ERR_BLOCKED_BY_ADMINISTRATOR` antes da renderização. Não houve tentativa de contornar o bloqueio. DOM/JSDOM, tipagem, build e regras CSS não substituem homologação visual autenticada desktop/mobile; essa limitação deve permanecer explícita no fechamento.
