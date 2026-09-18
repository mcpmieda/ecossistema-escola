# Correções qualitativas consolidadas de 2026 — #855 / BN-DEC-036

## Escopo

A auditoria de #852 encontrou 16 oferta-trimestres cuja soma de máximos qualitativos não coincidia com 16,5 em T1/T2 ou 22 em T3. A investigação separou configuração ainda em andamento de defeito determinístico.

O calendário produtivo de 2026 mantém T3 aberto até 16/12/2026. Por isso quatro casos de T3 — Educação Física 6B, Português 6C, Português 6D e Redação 7D — **não são corrigidos nem completados artificialmente**. O trimestre ainda pode receber definições/atividades da própria fonte.

A correção abrange somente 12 oferta-trimestres fechados de T1/T2.

## Evidência determinística

### 6A · Ética · T2

A 2ª atividade estava com máximo 3,0, mas havia lançamentos numéricos até 6,0. O histórico relacional registra a definição em 6,0 e uma importação posterior que a reduziu a 3,0. A correção restaura somente esse máximo para **6,0**. Nenhuma nota de aluno é modificada.

### Instrumentos qualitativos extras vazios

Nos demais casos, o período já contém 16,5 de máximo qualitativo em instrumentos realmente usados; os instrumentos excedentes não possuem nenhuma nota numérica no recorte investigado. Eles são tratados como placeholders/instrumentos não utilizados e deixam de ser ativos:

- Religião: 6B T1; 6D T1/T2; 7A T1; 7B T1; 7C T2; 7D T1/T2; 8A T1; 8B T1.
- Ciências 8C T1.

No 8B/T1 existem dois slots excedentes no mesmo oferta-trimestre. Ao todo, são 12 definições de instrumento suprimidas.

A migration remove somente observações vazias desses slots e registra a transição em nota_historico como observado em branco → não observado. Nota numérica é uma condição de bloqueio: se aparecer antes da correção, a migration falha em vez de apagá-la.

## Prevenção de regressão

institutional-qualitative-corrections-v1.ts contém um manifesto estreito por ano, professor, turma, componente, trimestre e slot.

- A correção de Ética aceita a definição investigada de 3,0 ou a representação já corrigida de 6,0 e normaliza para 6,0.
- Um slot suprimido só é aceito se a definição ainda corresponder ao estado investigado e todos os valores de estudante continuarem vazios.
- Valor numérico, valor indisponível ou mudança inesperada da definição interrompe a importação e exige nova investigação.
- T3 não participa desse manifesto.

A normalização roda tanto no produtor canônico, antes dos avisos de máximo, quanto novamente no servidor V11 antes da persistência. Assim uma chamada direta ao backend não contorna a correção.

## Migração atual

0010_qualitative_corrections_2026_v1.sql é uma correção de dados única e auditável:

- resolve os 13 instrumentos por identidade acadêmica e estado atual;
- exige os 13 alvos exatos ou falha;
- exige zero notas numéricas nos slots que serão suprimidos;
- registra uma importacao de correção, instrumento_historico e nota_historico;
- restaura o máximo 6,0 da Ética;
- limpa máximo/descrição e observações vazias somente dos 12 slots extras;
- remove os diagnósticos correntes de “acima do máximo” resolvidos pela correção da Ética;
- registra uma revisão acadêmica do Portal, quando a integração do Portal está instalada, para que a captura/publicação existente processe a mudança conforme as políticas vigentes;
- verifica que os 12 oferta-trimestres fechados terminam com máximo qualitativo ativo de 16,5 e sem máximo desconhecido.

Não há alteração de AM/U, REC, PARA, resultado oficial, decisão humana, boletim já emitido ou nota numérica.

## Fonte

As planilhas XLSB oficiais foram localizadas no OneDrive institucional. O formato XLSB não é reescrito por esta entrega: a correção durável é aplicada na normalização do importador porque a edição binária segura dessas planilhas não faz parte das ferramentas homologadas do repositório. Se a própria fonte mudar futuramente, o manifesto falha fechado em vez de mascarar a mudança.

## Validação

Os testes devem provar:

- normalização exata e idempotente;
- bloqueio se um slot suprimido ganhar qualquer evidência;
- ausência de efeito em T3/ofertas alheias;
- migration real em PostgreSQL/PGlite com histórico e pós-condição 16,5;
- reexecução sem novo delta;
- npm run verify e gate PostgreSQL/isolamento no HEAD final.

A aplicação produtiva exige preflight e pós-flight agregados, sem expor nomes/notas de estudantes em Git.
