# Minhas notas — entrega H / #750

Entrada única: `StudentGradesV1({ data: SelfResponseV1 })`, com o mesmo payload
autorizado que alimenta o perfil de #748. Montagem da rota e sessão pertence a #757.
Nenhum fetch, armazenamento, cálculo acadêmico, turma ou dado de terceiros.

- A união das chaves recebidas define as colunas, na sequência T1/T2/T3/REC1/REC2/REC3.
  A ausência de uma chave no payload inteiro não reserva coluna. Ausência só naquela
  disciplina mostra um traço neutro, com descrição distinta para recuperação.
- A ordenação das disciplinas usa `order`; as parciais mantêm a sequência e descrição
  entregues pelo BN. I/II e até dez atividades permanecem dentro da célula do trimestre.
  Finais e recuperações não ganham denominador inventado. Parciais mostram máximo
  somente se recebido; zero explícito não é ausência.
- `meetsMinimum` é mapeado diretamente para azul/âmbar/neutro e texto acessível.
  Vermelho fica reservado ao resultado oficial de reprovação.
  Não há percentual fixo, média, inferência de resultado ou arredondamento de nota.
  Intl apenas apresenta o número do DTO em pt-BR, preservando casas decimais.
- Resultado oficial por disciplina só aparece quando recebido; regular permanece
  Em curso na ausência dele. ASSISTIDO não recebe resultado global inferido.
- HeroUI Table/ScrollShadow: Disciplina fixa à esquerda, largura inicial proporcional
  ao espaço disponível, mínimos por conteúdo e limite de 600 px por coluna.
  Resize desktop por arraste ou pelo botão de ajuste: na grade, seta para cima chega
  ao cabeçalho; Enter inicia, setas ajustam e Enter/Escape concluem. Celulares usam
  rolagem horizontal local, sem controles de resize.
  Em viewport compacta ou com ponteiro de toque, Disciplina fica em 136 px mesmo
  após ter sido ampliada no desktop. A troca de modo reinicia as larguras para
  evitar que um ajuste anterior esconda as notas ou deixe uma área de scroll vazia.
- Troca de conta/revisões remonta o estado de largura. Nada persiste no navegador.
  Loading/erro/logout devem desmontar a tabela pelo shell/session de #748/#749.

## Evidência sintética

26 testes desta pasta e seis do shell: união de períodos, revisão que remove colunas,
13 disciplinas invertidas na entrada, 12 parciais por trimestre, nomes extensos,
zero/ausente/N-C/R-R, REC pendente/nota/não aplicável, máximo nulo, resultados,
ASSISTIDO, vazio, teclado e vetores do contrato #745 sem recalcular a classificação.

QA no navegador in-app, build Vite compilado com a CSP de produção, sem dados reais:
1280×850 e 320×740, modos final/detalhado/assistido/vazio, cores e texto acessível,
teclado e arraste. O mínimo de Disciplina foi respeitado em 136 px; arraste de
100 px alterou a largura em 100 px. A coluna ficou na mesma posição durante a
rolagem horizontal. A correção pontual do mínimo global em shared/styles.css,
registrada antes da edição na issue, eliminou 15 px de overflow do documento em
Windows com barra vertical clássica: largura útil/scroll do documento = 305/305
para viewport externa de 320 px; a tabela continuou rolando em seu próprio contêiner.
Também foi reproduzida e corrigida a transição desktop → celular após ampliar
Disciplina para 600 px: a regra compacta evita que a coluna fixa cubra todas as notas.

Browser Act foi bloqueado pelo Controle de Aplicativos do Windows já documentado
em #744/#748; o navegador in-app disponível foi usado sem contornar essa política.
Zoom real, dispositivos físicos, conteúdo autorizado e prova integrada de payload
oculto permanecem em #757–#759. QA de fixtures não equivale a abrir o Portal.
