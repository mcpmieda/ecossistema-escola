import { PerformanceStudentDetailV2 } from './performance-student-detail-v2';
import { PerformanceResultMatrixV2 } from './performance-result-matrix-v2';
import { PerformanceAnalysisPanelV3 } from './performance-analysis-panel-v3';
import { PERFORMANCE_LENSES_V3, type PerformanceLensV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import { useRef } from 'react';
import { Alert, Button, Chip, Drawer, Spinner, Tabs } from '@heroui/react';
import type { PerformanceFailureV2, PerformancePeriodV2, PerformanceModeV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { useRelationalPerformanceV2 } from './use-relational-performance-v2';

const failures: Record<PerformanceFailureV2, string> = {
  'not-authorized': 'Sua sessão não possui autorização. Entre novamente com uma conta autorizada.',
  'not-found': 'A turma ou o aluno não foi encontrado neste ano e nesta posição atual. Atualize a consulta.',
  'invalid-request': 'Não foi possível interpretar os filtros. Selecione novamente a turma e o período.',
  unavailable: 'Não foi possível concluir a consulta. Tente novamente; nenhuma nota foi alterada.',
  'scope-too-large': 'Esta turma ultrapassa o limite de uma consulta completa. A matriz não foi truncada; o recorte precisa ser ampliado no sistema.',
  'ambiguous-offers': 'Há mais de uma oferta para o mesmo componente nesta turma. Confira as atribuições antes de consultar o resultado.',
};
export function RelationalPerformancePageV2() {
  const state = useRelationalPerformanceV2();
  const lastFocus = useRef<HTMLElement | null>(null);
  const open = (studentId: number, offerId?: number) => { lastFocus.current = document.activeElement as HTMLElement; void state.open(studentId, offerId); };
  const close = () => { state.closeDetail(); lastFocus.current?.focus(); };
  const lensLabel: Record<PerformanceLensV3, string> = { result: 'Resultado', quantitative: 'Quantitativo', qualitative: 'Qualitativo', assessments: 'Avaliações' };
  const css = 'rounded-xl border border-separator bg-surface px-3 py-2 focus-visible:ring-2 focus-visible:ring-focus';
  if (state.year === null) return <p className="rounded-xl border border-separator p-5">Selecione o ano letivo no topo do Banco para consultar Desempenho.</p>;
  const detail = state.detail;
  return <section aria-label="Desempenho relacional" className="grid min-w-0 grid-cols-1 gap-3">
    <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">Desempenho</h2><Chip size="sm" variant="soft">Em validação</Chip></div>
      </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Turma<select aria-label="Turma" className={`${css} text-sm`} value={state.filters.classId ?? ''} disabled={state.busy.classes} onChange={(event) => void state.select({ classId: event.target.value ? Number(event.target.value) : null })}><option value="">Selecione a turma</option>{state.classes?.classes.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Período<select aria-label="Período" className={`${css} text-sm`} value={state.filters.period} onChange={(event) => void state.select({ period: event.target.value === 'annual' ? 'annual' : Number(event.target.value) as PerformancePeriodV2 })}><option value="1">1º trimestre</option><option value="2">2º trimestre</option><option value="3">3º trimestre</option><option value="annual">Visão geral</option></select></label>
      <label className="grid gap-1 text-sm">Modo<select aria-label="Modo" className={`${css} text-sm`} value={state.filters.mode} onChange={(event) => void state.select({ mode: event.target.value as PerformanceModeV2 })}><option value="regular">Regular</option><option value="recovery">Recuperação</option></select></label>
      <Button variant="secondary" isDisabled={state.busy.matrix || state.filters.classId === null} onPress={() => void state.select({})}>Atualizar consulta</Button>
      {!state.classes && !state.busy.classes ? <Button variant="secondary" onPress={() => void state.loadClasses()}>Tentar carregar turmas</Button> : null}
      {state.classes?.nextOffset !== null && state.classes?.nextOffset !== undefined ? <Button variant="ghost" isDisabled={state.busy.classes} onPress={() => void state.loadClasses(state.classes!.nextOffset!)}>Mais turmas</Button> : null}
    </div>
    {state.classes ? <fieldset className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 rounded-xl border border-separator p-3"><legend className="px-1 text-sm">Situações exibidas</legend>{state.classes.statusOptions.map((value) => <label key={String(value.value)} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={state.filters.statuses.includes(value.value)} disabled={state.filters.statuses.length === 1 && state.filters.statuses[0] === value.value} onChange={(event) => void state.select({ statuses: event.target.checked ? [...state.filters.statuses, value.value] : state.filters.statuses.filter((item) => item !== value.value) })}/>{value.label}</label>)}</fieldset> : null}
    {state.failure ? <Alert status="warning"><Alert.Content><Alert.Title>Consulta não concluída</Alert.Title><Alert.Description>{failures[state.failure]}</Alert.Description></Alert.Content></Alert> : null}
    {state.busy.matrix || state.busy.classes ? <p role="status" className="flex items-center gap-2 text-sm"><Spinner size="sm"/>Carregando leitura…</p> : null}
    {state.filters.classId !== null ? <Tabs selectedKey={state.filters.lens} onSelectionChange={(key) => { if (PERFORMANCE_LENSES_V3.includes(key as PerformanceLensV3)) void state.select({ lens: key as PerformanceLensV3 }); }}>
      <Tabs.ListContainer className="max-w-full self-start"><Tabs.List aria-label="Lentes de Desempenho">{PERFORMANCE_LENSES_V3.map((lens) => <Tabs.Tab key={lens} id={lens}>{lensLabel[lens]}<Tabs.Indicator/></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer>
      {PERFORMANCE_LENSES_V3.map((lens) => <Tabs.Panel key={lens} id={lens} className="grid min-w-0 gap-4">
        {state.filters.lens === lens ? <>
          {lens === 'assessments' ? <label className="grid gap-1 text-sm">Componente das avaliações<select aria-label="Componente das avaliações" className={`${css} text-sm`} value={state.filters.offerId ?? ''} onChange={(event) => void state.select({ offerId: event.target.value ? Number(event.target.value) : null })}><option value="">Selecione o componente</option>{state.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.subject.label} · {offer.teacher.label}</option>)}</select></label> : null}
          {state.analysis ? <PerformanceAnalysisPanelV3 key={`${state.analysis.matrix.readAt}:${JSON.stringify(state.filters)}`} value={state.analysis} open={open} focusOffer={(offerId) => void state.select({ lens: 'assessments', offerId })} renderResult={(ids) => <PerformanceResultMatrixV2 value={state.analysis!.matrix} open={open} allowedIds={ids} focusOffer={(offerId) => void state.select({ lens: 'assessments', offerId })}/>}/> : null}
        </> : null}
      </Tabs.Panel>)}
    </Tabs> : null}
    <Drawer.Backdrop isOpen={state.detailOpen} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <Drawer.Content placement="right"><Drawer.Dialog className="w-full max-w-full sm:w-[min(52rem,90vw)]">
        <Drawer.CloseTrigger aria-label="Fechar detalhe"/>
        {detail ? <PerformanceStudentDetailV2 detail={detail} openComponent={(id, offerId) => void state.open(id, offerId)} openCenter={(id) => { close(); state.openStudent?.(id); }}/> : <>
          <Drawer.Header><Drawer.Heading>Detalhe do aluno</Drawer.Heading></Drawer.Header>
          <Drawer.Body>{state.busy.detail ? <p role="status">Carregando detalhe…</p> : null}{state.detailFailure ? <p role="alert">{failures[state.detailFailure]}</p> : null}</Drawer.Body>
        </>}
        <Drawer.Footer><Button variant="secondary" onPress={close}>Fechar</Button></Drawer.Footer>
      </Drawer.Dialog></Drawer.Content>
    </Drawer.Backdrop>
  </section>;
}
