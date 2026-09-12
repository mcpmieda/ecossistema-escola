import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Drawer, Label, ListBox, Select, Spinner, Tabs } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import { PerformanceStudentDetailV2 } from './performance-student-detail-v2';
import { PerformanceResultMatrixV2 } from './performance-result-matrix-v2';
import { PerformanceAnalysisPanelV3 } from './performance-analysis-panel-v3';
import { PerformanceTermComparisonPanelV4 } from './performance-term-comparison-panel-v4';
import { PERFORMANCE_LENSES_V3, type PerformanceLensV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import type { PerformanceFailureV2, PerformancePeriodV2, PerformanceModeV2, PerformanceStatusV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { useRelationalPerformanceV2 } from './use-relational-performance-v2';

const failures: Record<PerformanceFailureV2, string> = {
  'not-authorized': 'Sua sessão não possui autorização. Entre novamente com uma conta autorizada.',
  'not-found': 'A turma ou o aluno não foi encontrado neste ano e nesta posição atual. Atualize a consulta.',
  'invalid-request': 'Não foi possível interpretar os filtros. Selecione novamente a turma e o período.',
  unavailable: 'Não foi possível concluir a consulta. Tente novamente; nenhuma nota foi alterada.',
  'scope-too-large': 'Esta turma ultrapassa o limite de uma consulta completa. A matriz não foi truncada; o recorte precisa ser ampliado no sistema.',
  'ambiguous-offers': 'Há mais de uma oferta para o mesmo componente nesta turma. Confira as atribuições antes de consultar o resultado.',
};

interface FilterItem { readonly id: string; readonly label: string; }
type PerformanceSelectId = 'class' | 'period' | 'mode' | 'comparison' | 'assessment-component';
function PerformanceSelect({ id, label, value, items, disabled = false, isOpen, onOpenChange, onChange }: {
  readonly id: PerformanceSelectId;
  readonly label: string;
  readonly value: string;
  readonly items: readonly FilterItem[];
  readonly disabled?: boolean;
  readonly isOpen: boolean;
  readonly onOpenChange: (id: PerformanceSelectId, isOpen: boolean) => void;
  readonly onChange: (value: string) => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || root.current?.contains(target) || target.closest(`[data-performance-select-popover="${id}"]`)) return;
      const nextSelect = target.closest<HTMLElement>('[data-performance-select]')?.dataset.performanceSelect as PerformanceSelectId | undefined;
      if (nextSelect !== undefined && event.pointerType !== 'touch') {
        onOpenChange(nextSelect, true);
        return;
      }
      onOpenChange(id, false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [id, isOpen, onOpenChange]);
  return <Select ref={root} data-performance-select={id} selectedKey={value} isDisabled={disabled} isOpen={isOpen} onOpenChange={(open) => onOpenChange(id, open)}
    onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}>
    <Label className="mb-1.5 block text-xs font-medium text-muted">{label}</Label>
    <Select.Trigger className="min-h-10 w-full"><Select.Value/><Select.Indicator/></Select.Trigger>
    <Select.Popover isNonModal data-performance-select-popover={id}><ListBox>{items.map((item) => <ListBox.Item key={item.id} id={item.id} textValue={item.label}>{item.label}<ListBox.ItemIndicator/></ListBox.Item>)}</ListBox></Select.Popover>
  </Select>;
}

export function RelationalPerformancePageV2() {
  const state = useRelationalPerformanceV2();
  const [openSelect, setOpenSelect] = useState<PerformanceSelectId | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const changeOpenSelect = useCallback((id: PerformanceSelectId, isOpen: boolean) => {
    setOpenSelect((current) => isOpen ? id : current === id ? null : current);
  }, []);
  const open = (studentId: number, offerId?: number) => { lastFocus.current = document.activeElement as HTMLElement; void state.open(studentId, offerId); };
  const close = () => { state.closeDetail(); lastFocus.current?.focus(); };
  const lensLabel: Record<PerformanceLensV3, string> = { result: 'Resultado', quantitative: 'Quantitativo', qualitative: 'Qualitativo', assessments: 'Avaliações' };
  if (state.year === null) return <p className="rounded-xl border border-separator p-5">A sessão do Banco de Notas está indisponível. Entre novamente para consultar Desempenho.</p>;
  const detail = state.detail;
  const comparisonDisabled = state.filters.lens === 'assessments' || state.filters.period === 1 || state.filters.period === 'annual';
  const comparisonItems: FilterItem[] = [{ id: 'none', label: 'Sem comparação' }, { id: '1', label: '1º trimestre' }];
  if (state.filters.period === 3) comparisonItems.push({ id: '2', label: '2º trimestre' });
  return <section aria-label="Desempenho relacional" className="grid min-w-0 grid-cols-1 gap-4">
    <header className="flex min-h-12 flex-wrap items-center gap-2">
      <div><h2 className="text-xl font-semibold tracking-[-0.03em]">Desempenho</h2><p className="text-xs text-muted">Leitura relacional da turma, sem recalcular notas na interface.</p></div>
      <Chip size="sm" variant="soft" color="accent" className="ml-auto">Calculado · {state.year}</Chip>
    </header>
    <div className="performance-filterbar" aria-label="Filtros de Desempenho">
      <PerformanceSelect id="class" label="Turma" value={state.filters.classId === null ? 'none' : String(state.filters.classId)} disabled={state.busy.classes}
        isOpen={openSelect === 'class'} onOpenChange={changeOpenSelect}
        items={[{ id: 'none', label: 'Selecione a turma' }, ...(state.classes?.classes.map((item) => ({ id: String(item.id), label: item.label })) ?? [])]}
        onChange={(value) => void state.select({ classId: value === 'none' ? null : Number(value) })}/>
      <PerformanceSelect id="period" label="Período" value={String(state.filters.period)} isOpen={openSelect === 'period'} onOpenChange={changeOpenSelect} items={[
        { id: '1', label: '1º trimestre' }, { id: '2', label: '2º trimestre' }, { id: '3', label: '3º trimestre' }, { id: 'annual', label: 'Visão geral' },
      ]} onChange={(value) => void state.select({ period: value === 'annual' ? 'annual' : Number(value) as PerformancePeriodV2 })}/>
      <PerformanceSelect id="mode" label="Modo" value={state.filters.mode} isOpen={openSelect === 'mode'} onOpenChange={changeOpenSelect} items={[{ id: 'regular', label: 'Regular' }, { id: 'recovery', label: 'Recuperação' }]}
        onChange={(value) => void state.select({ mode: value as PerformanceModeV2 })}/>
      <PerformanceSelect id="comparison" label="Comparar com" value={state.filters.referencePeriod === null ? 'none' : String(state.filters.referencePeriod)} items={comparisonItems} disabled={comparisonDisabled}
        isOpen={openSelect === 'comparison'} onOpenChange={changeOpenSelect}
        onChange={(value) => void state.select({ referencePeriod: value === 'none' ? null : Number(value) as 1 | 2 })}/>
      <Button variant="primary" className="min-h-10" isDisabled={state.busy.matrix || state.filters.classId === null} onPress={() => void state.select({})}><RefreshCw size={16}/>Atualizar</Button>
    </div>
    {state.filters.classId !== null ? <Tabs selectedKey={state.filters.lens} className="performance-lens-tabs min-w-0" onSelectionChange={(key) => { if (PERFORMANCE_LENSES_V3.includes(key as PerformanceLensV3)) void state.select({ lens: key as PerformanceLensV3 }); }}>
      <Tabs.ListContainer className="h-10 max-w-full self-start"><Tabs.List aria-label="Lentes de Desempenho">{PERFORMANCE_LENSES_V3.map((lens) => <Tabs.Tab key={lens} id={lens} className="min-w-28">{lensLabel[lens]}<Tabs.Indicator/></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer>
      <div className="performance-lens-status min-h-5" aria-live="polite">{state.busy.matrix || state.busy.classes ? <p role="status" className="flex items-center gap-2 text-xs text-muted"><Spinner size="sm"/>Atualizando a mesma leitura…</p> : null}{state.failure ? <Alert status="warning"><Alert.Content><Alert.Title>Consulta não concluída</Alert.Title><Alert.Description>{failures[state.failure]}</Alert.Description></Alert.Content></Alert> : null}</div>
      {PERFORMANCE_LENSES_V3.map((lens) => <Tabs.Panel key={lens} id={lens} className="performance-lens-panel grid min-w-0 gap-4">
        {state.filters.lens === lens ? <>
          {lens === 'assessments' ? <div className="max-w-xl"><PerformanceSelect id="assessment-component" label="Componente das avaliações" value={state.filters.offerId === null ? 'none' : String(state.filters.offerId)}
            isOpen={openSelect === 'assessment-component'} onOpenChange={changeOpenSelect}
            items={[{ id: 'none', label: 'Selecione o componente' }, ...state.offers.map((offer) => ({ id: String(offer.id), label: `${offer.subject.label} · ${offer.teacher.label}` }))]}
            onChange={(value) => void state.select({ offerId: value === 'none' ? null : Number(value) })}/></div> : null}
          {state.comparison ? <PerformanceTermComparisonPanelV4 key={`comparison:${state.comparison.analysis.matrix.readAt}:${JSON.stringify(state.filters)}`} value={state.comparison} open={open}/> : null}
          {state.analysis && state.dashboard ? <PerformanceAnalysisPanelV3 key={`${state.analysis.matrix.readAt}:${JSON.stringify(state.filters)}`} value={state.analysis} dashboard={state.dashboard} open={open} focusOffer={(offerId) => void state.select({ lens: 'assessments', offerId })} renderResult={(ids) => <PerformanceResultMatrixV2 value={state.analysis!.matrix} open={open} allowedIds={ids} focusOffer={(offerId) => void state.select({ lens: 'assessments', offerId })} statusOptions={state.classes?.statusOptions ?? []} statuses={state.filters.statuses} onStatusesChange={(statuses: PerformanceStatusV2[]) => void state.select({ statuses })}/>}/> : null}
        </> : null}
      </Tabs.Panel>)}
    </Tabs> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-separator bg-surface-secondary/40 p-8 text-center"><div><strong className="text-sm">Escolha uma turma para começar</strong><p className="mt-1 text-xs text-muted">Os indicadores e a matriz serão carregados no mesmo recorte.</p></div></div>}
    {!state.classes && !state.busy.classes ? <Button variant="secondary" className="justify-self-start" onPress={() => void state.loadClasses()}>Tentar carregar turmas</Button> : null}
    {state.classes?.nextOffset !== null && state.classes?.nextOffset !== undefined ? <Button variant="ghost" className="justify-self-start" isDisabled={state.busy.classes} onPress={() => void state.loadClasses(state.classes!.nextOffset!)}>Mais turmas</Button> : null}
    <Drawer.Backdrop isOpen={state.detailOpen} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <Drawer.Content placement="right"><Drawer.Dialog className="w-full max-w-full sm:w-[min(52rem,90vw)]"><Drawer.CloseTrigger aria-label="Fechar detalhe"/>
        {detail ? <PerformanceStudentDetailV2 detail={detail} focusPeriod={state.filters.period} openComponent={(id, offerId) => void state.open(id, offerId)} openCenter={(id) => { close(); state.openStudent?.(id); }}/> : <><Drawer.Header><Drawer.Heading>Detalhe do aluno</Drawer.Heading></Drawer.Header><Drawer.Body>{state.busy.detail ? <p role="status">Carregando detalhe…</p> : null}{state.detailFailure ? <p role="alert">{failures[state.detailFailure]}</p> : null}</Drawer.Body></>}
        <Drawer.Footer><Button variant="secondary" onPress={close}>Fechar</Button></Drawer.Footer>
      </Drawer.Dialog></Drawer.Content>
    </Drawer.Backdrop>
  </section>;
}
