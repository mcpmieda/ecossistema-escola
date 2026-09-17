import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Accordion, Alert, Avatar, Button, Card, Chip, Meter, SearchField, Table } from '@heroui/react';
import { ArrowRight, BookOpen, MessageCircle, TrendingDown, TrendingUp, Users } from 'lucide-react';
import type { PerformanceAnalyticsV6 } from '../../../../shared/gradebook-contracts/performance/performance-analytics-v6';
import {
  AnalyticsBarsV6, AnalyticsCoverageV6, AnalyticsHintV6, AnalyticsPanelV6,
  AnalyticsRecoveryV6, AnalyticsTimelineV6,
} from './performance-analytics-charts-v6';
import { analyticsPercentV6 as percent, analyticsDeltaV6 as delta, analyticsNumberV6 as number } from './analytics-format-v6';
import './performance-learning-v1.css';

type Filter = 'all' | 'attention' | 'rising' | 'falling' | 'compared' | 'participation' |
  'above' | 'below' | 'pending' | 'below-up' | 'below-down' | 'above-down' | 'recovery';
const LABELS: Record<Filter, string> = {
  all: 'Todos os alunos', attention: 'Atenção recorrente', rising: 'Maiores evoluções',
  falling: 'Maiores quedas', compared: 'Alunos com comparação', participation: 'Participação por aluno',
  above: 'Na referência em todos os componentes', below: 'Abaixo em algum componente',
  pending: 'Ainda sem conclusão', 'below-up': 'Abaixo, mas melhorando',
  'below-down': 'Abaixo e com queda', 'above-down': 'Na referência, mas com queda', recovery: 'Melhoraram com a paralela',
};
function Panel({ title, hint, children, footer }: {
  title: string; hint: string; children: ReactNode; footer?: ReactNode;
}) {
  return <AnalyticsPanelV6 title={title} action={<AnalyticsHintV6 label={`Sobre ${title}`}>{hint}</AnalyticsHintV6>} footer={footer}>{children}</AnalyticsPanelV6>;
}
function MetricBar({ label, caption, value, tone }: { label: string; caption: string; value: number | null; tone: string }) {
  return <div className={`learning-dimension learning-tone--${tone}`}>
    <div className="learning-inline"><div><strong>{label}</strong><span className="learning-muted">{caption}</span></div><b>{percent(value)}</b></div>
    {value !== null ? <Meter aria-label={label} value={value} maxValue={Math.max(100, value)}><Meter.Track><Meter.Fill /></Meter.Track></Meter> : <span className="learning-muted">Sem notas suficientes para comparar.</span>}
  </div>;
}

export function PerformanceLearningOverviewV1({ value, onStudent, onComponent, onPeriod, onNotes }: {
  value: PerformanceAnalyticsV6;
  onStudent: (id: number, offerId?: number) => void;
  onComponent: (offerId: number) => void;
  onPeriod: (term: 1 | 2 | 3) => void;
  onNotes: (offerId: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>('attention');
  const [search, setSearch] = useState('');
  const listHeading = useRef<HTMLHeadingElement>(null);
  const learning = value.learning;
  const rows = useMemo(() => {
    const evidence = new Map(value.learning?.students.map((item) => [item.studentId, item]) ?? []);
    return value.students.map((student) => ({ ...student, evidence: evidence.get(student.student.id) }));
  }, [value]);
  const reference = value.summary.movement.reference;
  const matches = (row: (typeof rows)[number], selected: Filter) => {
    const change = row.summary.movement.meanDeltaPP;
    const below = row.summary.below > 0;
    const above = row.summary.studentsAtOrAbove === 1;
    switch (selected) {
      case 'attention': return (row.evidence?.recurring.length ?? 0) > 0;
      case 'rising': return change !== null && change > 0;
      case 'falling': return change !== null && change < 0;
      case 'compared': return change !== null;
      case 'participation': return row.evidence?.participation.percent != null;
      case 'above': return above;
      case 'below': return below;
      case 'pending': return !below && !above;
      case 'below-up': return below && change !== null && change > 0;
      case 'below-down': return below && change !== null && change < 0;
      case 'above-down': return above && change !== null && change < 0;
      case 'recovery': return (row.evidence?.parallelImprovements ?? 0) > 0;
      default: return true;
    }
  };
  const count = (selected: Filter) => rows.filter((row) => matches(row, selected)).length;
  const select = (selected: Filter) => { setFilter(selected); setSearch(''); listHeading.current?.focus(); };
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const selectedRows = rows.filter((row) => matches(row, filter));
  const visibleRows = selectedRows.filter((row) => !query || row.student.name.toLocaleLowerCase('pt-BR').includes(query) || String(row.student.number) === query)
    .sort((a, b) => {
      if (filter === 'rising') return (b.summary.movement.meanDeltaPP ?? 0) - (a.summary.movement.meanDeltaPP ?? 0) || a.student.number - b.student.number;
      if (filter === 'falling' || filter === 'below-down' || filter === 'above-down') return (a.summary.movement.meanDeltaPP ?? 0) - (b.summary.movement.meanDeltaPP ?? 0) || a.student.number - b.student.number;
      if (filter === 'attention') return (b.evidence?.recurring.length ?? 0) - (a.evidence?.recurring.length ?? 0) || (a.summary.movement.meanDeltaPP ?? 0) - (b.summary.movement.meanDeltaPP ?? 0) || a.student.number - b.student.number;
      return a.student.number - b.student.number;
    });
  const assessed = learning?.students.filter((item) => item.recurrenceAssessed).length ?? 0;
  const componentLabels = new Map(value.components.map((item) => [item.offer.id, item.offer.subject.label]));
  const instruments = new Map(value.components.flatMap((component) => component.instruments.map((instrument) => [instrument.key, { ...instrument, offerId: component.offer.id, subject: component.offer.subject.label }] as const)));
  const reviewActivities = (learning?.activitiesToReview ?? []).map((key) => instruments.get(key)).filter((item): item is NonNullable<typeof item> => item !== undefined);
  const periodName = value.period === 'annual' ? 'Ano letivo' : `${value.period}º trimestre`;
  const kpis = [
    { title: 'Desempenho médio', value: percent(value.summary.result.mean), caption: `${value.students.filter((item) => item.summary.complete > 0).length} alunos com resultado · ${periodName}`, icon: BookOpen, tone: 'accent', filter: 'all' as Filter,
      hint: 'Média das notas finais calculadas dos componentes, em percentual. Mantém os pesos da escola; notas incompletas não entram. Não é medida direta de conhecimento.' },
    { title: 'Evolução trimestral', value: delta(value.summary.movement.meanDeltaPP), caption: reference ? `Em relação ao ${reference}º trimestre` : 'Disponível a partir do 2º trimestre', icon: TrendingUp, tone: 'accent', filter: 'compared' as Filter,
      hint: 'Compara os mesmos alunos e componentes nos dois trimestres. Sinal positivo indica notas maiores; negativo, menores. A dificuldade das avaliações pode variar.' },
    { title: 'Alunos em evolução', value: reference && count('compared') ? String(count('rising')) : '—', caption: reference ? `de ${count('compared')} alunos com comparação` : 'Ainda sem trimestre anterior', icon: Users, tone: 'success', filter: 'rising' as Filter,
      hint: 'Alunos cuja média das mudanças de nota foi positiva em relação ao trimestre anterior. Não usa a ordem das atividades como se fosse uma data.' },
    { title: 'Atenção recorrente', value: learning && assessed ? String(count('attention')) : '—', caption: `${assessed} alunos com base para analisar`, icon: TrendingDown, tone: 'warning', filter: 'attention' as Filter,
      hint: 'Notas abaixo da referência repetidas no mesmo componente: em 2 dos últimos trimestres ou em pelo menos 2 de 3 ou mais instrumentos com nota. Participação não conta como dificuldade nas atividades.' },
  ];
  const distribution: { key: Filter; label: string; count: number; tone: string }[] = [
    { key: 'above', label: 'Na referência em todos', count: count('above'), tone: 'success' },
    { key: 'below', label: 'Abaixo em algum componente', count: count('below'), tone: 'warning' },
    { key: 'pending', label: 'Ainda sem conclusão', count: count('pending'), tone: 'muted' },
  ];
  return <div className="learning-overview" data-testid="performance-learning-overview-v1">
    <div className="learning-kpis learning-enter">
      {kpis.map((item) => <Card key={item.title} className={`learning-kpi learning-tone--${item.tone}`}>
        <Card.Header><span className="learning-kpi-icon"><item.icon size={17} aria-hidden="true" /></span><span>{item.title}</span><AnalyticsHintV6 label={`Sobre ${item.title}`}>{item.hint}</AnalyticsHintV6></Card.Header>
        <Card.Content><Button variant="ghost" className="learning-kpi-button" onPress={() => select(item.filter)} aria-label={`Ver alunos: ${item.title}`}><strong>{item.value}</strong><ArrowRight size={16} aria-hidden="true" /></Button><span className="learning-muted">{item.caption}</span></Card.Content>
      </Card>)}
    </div>
    {!learning ? <Alert><Alert.Content><Alert.Title>Indicadores complementares ainda indisponíveis.</Alert.Title><Alert.Description>Não há dados suficientes nesta resposta para participação e atenção recorrente.</Alert.Description></Alert.Content></Alert> : null}
    <div className="learning-row learning-row--journey learning-enter">
      <AnalyticsTimelineV6 summary={value.summary} onPeriod={onPeriod} schoolLanguage />
      <Panel title="Quantitativo × qualitativo" hint="Compara os mesmos alunos e componentes. Quantitativo: as duas avaliações, antes da recuperação paralela. Qualitativo: atividades e participação. Uma diferença não explica, sozinha, sua causa.">
        <div className="learning-composition">
          <MetricBar label="Quantitativo" caption="Duas avaliações por trimestre" value={learning?.dimensions.quantitativePercent ?? null} tone="accent" />
          <MetricBar label="Qualitativo" caption="Atividades + participação" value={learning?.dimensions.qualitativePercent ?? null} tone="violet" />
          <div className="learning-composition-note">{learning?.dimensions.gapPP != null ? <><strong>{number(Math.abs(learning.dimensions.gapPP))} p.p.</strong><span>{learning.dimensions.gapPP === 0 ? 'Mesmo desempenho nos dois grupos.' : `${learning.dimensions.gapPP > 0 ? 'Qualitativo' : 'Quantitativo'} acima nesta comparação.`}</span></> : <span>Comparação aguardando notas dos dois grupos.</span>}</div>
          <span className="learning-muted">Base comum: {learning?.dimensions.students ?? 0} alunos.</span>
        </div>
      </Panel>
    </div>
    <div className="learning-row learning-row--evidence learning-enter">
      <Panel title="Participação avaliada" hint="Resume as notas de participação dadas pelos professores. Reúne as partes pelos pontos possíveis; cada aluno tem o mesmo peso no resumo. Não mede presença, disciplina ou personalidade.">
        <div className="learning-participation"><MessageCircle className="learning-participation-icon" size={24} aria-hidden="true" /><strong className="learning-score">{percent(learning?.participation.percent ?? null)}</strong><span className="learning-muted">Já incluída no qualitativo.</span>
          <span className="learning-participation-change">{learning?.participation.deltaPP != null ? `${delta(learning.participation.deltaPP)} desde T${reference}` : 'Sem comparação entre trimestres.'}</span>
          <span className="learning-muted">{learning?.participation.students ?? 0} alunos · {learning?.participation.recorded ?? 0} notas consideradas</span>
          {learning && learning.participation.recorded < learning.participation.expected ? <span className="learning-muted">Resultado parcial das notas disponíveis.</span> : null}
          <Button size="sm" variant="secondary" onPress={() => select('participation')}>Ver participação por aluno <ArrowRight size={14} /></Button>
        </div>
      </Panel>
      <Panel title="Situação nas notas" hint={`Referência da escola: ${percent(value.minimumPercent)}. Um aluno fica abaixo se tiver ao menos um componente com resultado completo abaixo desse valor. Sem resultado suficiente não significa dificuldade.`}>
        <div className="learning-distribution" aria-hidden="true">{distribution.filter((item) => item.count > 0).map((item) => <span key={item.key} className={`learning-tone--${item.tone}`} style={{ flexGrow: item.count }} />)}</div>
        <div className="learning-distribution-list">{distribution.map((item) => <Button key={item.key} variant="ghost" className={`learning-distribution-item learning-tone--${item.tone}`} onPress={() => select(item.key)}><span className="learning-dot" /><span>{item.label}</span><strong>{item.count}</strong></Button>)}</div>
        <span className="learning-muted">{value.summary.students} alunos · referência {percent(value.minimumPercent)}</span>
      </Panel>
      <Panel title="Componentes" hint="Desempenho médio em cada disciplina, alunos abaixo da referência e mudança desde o trimestre anterior. Clique no componente para ver as notas.">
        <div className="learning-component-scroll"><AnalyticsBarsV6 items={value.components.map((item) => ({
          id: item.offer.id, label: item.offer.subject.label, value: item.summary.result.mean,
          below: item.summary.result.mean !== null && item.summary.result.mean < value.minimumPercent,
          secondary: `${item.summary.below} abaixo da referência · ${item.summary.complete} com resultado${item.summary.movement.meanDeltaPP !== null ? ` · ${delta(item.summary.movement.meanDeltaPP)}` : ''}`,
        }))} onSelect={onComponent} /></div>
      </Panel>
    </div>
    <div className="learning-row learning-row--action learning-enter">
      <Panel title="Acompanhamento dos alunos" hint="Clique nos indicadores para filtrar esta lista. Ela mostra as notas que justificam o acompanhamento; não é um diagnóstico do aluno.">
        <div className="learning-filters" aria-label="Filtros de acompanhamento">{(['attention', 'rising', 'falling', 'all'] as const).map((key) => <Button key={key} size="sm" variant={filter === key ? 'secondary' : 'ghost'} aria-pressed={filter === key} onPress={() => { setFilter(key); setSearch(''); }}>{key === 'attention' ? 'Acompanhar' : key === 'rising' ? 'Evoluções' : key === 'falling' ? 'Quedas' : 'Todos'}</Button>)}</div>
        <div className="learning-list-heading"><h3 ref={listHeading} tabIndex={-1}>{LABELS[filter]}</h3><Chip size="sm">{selectedRows.length}</Chip></div>
        <SearchField aria-label="Buscar no acompanhamento" value={search} onChange={setSearch}><SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder="Buscar aluno" /><SearchField.ClearButton /></SearchField.Group></SearchField>
        <div className="learning-students">
          <Table><Table.ScrollContainer><Table.Content aria-label={LABELS[filter]}><Table.Header><Table.Column id="student" isRowHeader>Aluno</Table.Column><Table.Column id="result">{filter === 'participation' ? 'Participação' : 'Notas'}</Table.Column><Table.Column id="reason">O que observar</Table.Column></Table.Header><Table.Body>{visibleRows.map((row) => {
            const first = row.evidence?.recurring[0];
            const reasons = first ? `${componentLabels.get(first.offerId) ?? 'Componente'}: ${first.consecutiveTerms.length ? 'abaixo em trimestres seguidos' : 'notas baixas em mais de um instrumento'}` : row.summary.below ? `${row.summary.below} componentes abaixo da referência` : row.summary.complete ? 'Confira o desempenho por componente' : 'Ainda sem resultado suficiente';
            return <Table.Row key={row.student.id} id={String(row.student.id)}><Table.Cell><div className="learning-student-name"><Avatar size="sm"><Avatar.Fallback>{row.student.name.split(/\s/u).map((word) => word[0]).slice(0, 2).join('')}</Avatar.Fallback></Avatar><Button size="sm" variant="ghost" onPress={() => onStudent(row.student.id, filter === 'attention' ? first?.offerId : undefined)} aria-label={`Ver notas de ${row.student.name}`}>{row.student.name}</Button></div></Table.Cell><Table.Cell><strong>{percent(filter === 'participation' ? row.evidence?.participation.percent ?? null : row.summary.result.mean)}</strong><span className="learning-muted">{delta(filter === 'participation' ? row.evidence?.participation.deltaPP ?? null : row.summary.movement.meanDeltaPP)}</span></Table.Cell><Table.Cell><span>{filter === 'participation' ? `${row.evidence?.participation.components ?? 0} componentes · ${row.evidence?.participation.recorded ?? 0} notas de participação` : filter === 'recovery' ? `${row.evidence?.parallelImprovements ?? 0} resultados melhorados com a paralela` : reasons}</span></Table.Cell></Table.Row>;
          })}</Table.Body></Table.Content></Table.ScrollContainer></Table>
          {!visibleRows.length ? <p className="learning-empty">{query ? 'Nenhum aluno encontrado nesta busca.' : filter === 'attention' && !assessed ? 'Ainda não há notas suficientes para avaliar a recorrência.' : 'Nenhum aluno neste grupo.'}</p> : null}
        </div>
        {reference ? <div className="learning-priority" aria-label="Nível atual e evolução">{(['below-up', 'below-down', 'above-down'] as const).map((key) => <Button key={key} size="sm" variant="ghost" onPress={() => select(key)}><strong>{count(key)}</strong><span>{LABELS[key]}</span></Button>)}</div> : null}
      </Panel>
      <Panel title="Atividades para revisar" hint="Atividades em que há alunos abaixo da referência, começando pelas que concentram mais dificuldades. Exige ao menos 3 notas com máximo conhecido. Participação e paralela ficam fora desta lista.">
        <div className="learning-activity-list">{reviewActivities.slice(0, 5).map((item) => <Button key={item.key} variant="ghost" className="learning-activity" onPress={() => onNotes(item.offerId)}><span><strong>{item.label}</strong><span className="learning-muted">{item.subject} · T{item.term}</span><span className="learning-muted">{item.below} de {item.stats.n} alunos abaixo</span></span><span className="learning-activity-score">{percent(item.stats.mean)}<ArrowRight size={14} /></span></Button>)}</div>
        {!reviewActivities.length ? <p className="learning-empty">{learning ? 'Nenhuma atividade com dificuldade identificada e base suficiente neste recorte.' : 'Aguardando os indicadores complementares.'}</p> : <span className="learning-muted">Até 5 destaques. Clique para ver todas as notas do componente.</span>}
        <div className="learning-recovery-summary"><strong>{learning?.parallel.students ?? '—'}</strong><span>alunos melhoraram com a recuperação paralela</span><Button size="sm" variant="ghost" onPress={() => select('recovery')}>Ver alunos <ArrowRight size={14} /></Button></div>
      </Panel>
    </div>
    <Accordion className="learning-secondary learning-enter" allowsMultipleExpanded>
      <Accordion.Item id="recovery"><Accordion.Heading><Accordion.Trigger><span>Recuperação · detalhes</span><Accordion.Indicator /></Accordion.Trigger></Accordion.Heading><Accordion.Panel><Accordion.Body><p className="learning-muted">A paralela elevou {learning?.parallel.improvements ?? 0} resultados. Ganho médio nesses casos: {delta(learning?.parallel.meanGainPP ?? null)} do máximo quantitativo. Isso descreve a nota, não prova a causa da melhora.</p><AnalyticsRecoveryV6 summary={value.summary} /></Accordion.Body></Accordion.Panel></Accordion.Item>
      <Accordion.Item id="quality"><Accordion.Heading><Accordion.Trigger><span>Base dos indicadores · qualidade dos dados</span><Accordion.Indicator /></Accordion.Trigger></Accordion.Heading><Accordion.Panel><Accordion.Body><p className="learning-muted">Notas ausentes não viram zero. Participação usa notas com máximo conhecido; sua evolução exige os mesmos componentes completos nos dois períodos. Os resultados são descritivos, sem alterar o boletim.</p><AnalyticsCoverageV6 summary={value.summary} /></Accordion.Body></Accordion.Panel></Accordion.Item>
    </Accordion>
    <footer className="learning-footer"><span>{value.summary.students}/{value.classStudents} alunos · {periodName} · referência {percent(value.minimumPercent)}</span><span>Notas calculadas para acompanhamento, não diagnóstico.</span></footer>
  </div>;
}
