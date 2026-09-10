import { PerformanceAnalysisPanelV3 } from './performance-analysis-panel-v3';
import { PERFORMANCE_LENSES_V3, type PerformanceLensV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import { useRef, useState } from 'react';
import { Alert, Button, Chip, Drawer, Spinner, Tabs } from '@heroui/react';
import type { PerformanceCellV2, PerformanceFailureV2, PerformancePeriodV2, PerformanceModeV2, PerformanceMatrixV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { useRelationalPerformanceV2 } from './use-relational-performance-v2';

const format = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const valueText = (value: number | null) => value === null ? '—' : format.format(value / 1000);
const stateText: Record<PerformanceCellV2['state'], string> = { complete: 'Completo', partial: 'Parcial', 'not-recorded': 'Sem lançamento', unavailable: 'Definição incompleta', 'not-applicable': 'Não se aplica', 'recovery-pending': 'Aguardando REC', 'no-show': 'N/C' };
const compactState: Record<PerformanceCellV2['state'], string> = { complete: '', partial: 'Parcial', 'not-recorded': 'Sem nota', unavailable: 'Indisp.', 'not-applicable': 'N/A', 'recovery-pending': 'Pendente', 'no-show': 'N/C' };
function columnLabel(value: string): string {
  const words = value.match(/\p{L}[\p{L}\p{M}]*|\d+/gu) ?? [];
  return words.length <= 1 ? value.slice(0, 4).toUpperCase() : words.filter((word) => word.length > 2 || /^\d+$/u.test(word)).slice(0, 3).map((word) => /^\d+$/u.test(word) ? word : word[0]).join('').toUpperCase() || value.slice(0, 4).toUpperCase();
}
const failures: Record<PerformanceFailureV2, string> = {
  'not-authorized': 'Sua sessão não possui autorização. Entre novamente com uma conta autorizada.',
  'not-found': 'A turma ou o aluno não foi encontrado neste ano e nesta posição atual. Atualize a consulta.',
  'invalid-request': 'Não foi possível interpretar os filtros. Selecione novamente a turma e o período.',
  unavailable: 'Não foi possível concluir a consulta. Tente novamente; nenhuma nota foi alterada.',
  'scope-too-large': 'Esta turma ultrapassa o limite de uma consulta completa. A matriz não foi truncada; o recorte precisa ser ampliado no sistema.',
  'ambiguous-offers': 'Há mais de uma oferta para o mesmo componente nesta turma. Confira as atribuições antes de consultar o resultado.',
};
function CellValue({ cell }: { readonly cell: PerformanceCellV2 }) {
  return <span className={`inline-flex flex-col items-center gap-0.5 ${cell.level === 'below' ? 'text-danger' : cell.level === 'at-or-above' ? 'text-accent' : 'text-foreground'}`}>
    <span className="font-semibold tabular-nums">{cell.state === 'no-show' ? 'N/C' : cell.state === 'recovery-pending' ? 'REC' : valueText(cell.valueMilli)}</span>
    {cell.state === 'complete' ? <span className="sr-only">{cell.level === 'below' ? 'Abaixo do limite' : 'No limite ou acima'}</span> : cell.state === 'no-show' ? null : <span className="text-[10px] leading-tight">{compactState[cell.state]}</span>}
    {cell.warningCodes.length > 0 ? <span className="text-[10px] text-muted">Aviso</span> : null}
  </span>;
}
function Matrix({ value, open, allowedIds }: { readonly value: PerformanceMatrixV2; readonly open: (studentId: number, offerId?: number) => void; readonly allowedIds: ReadonlySet<number> | null }) {
  const [investigation, setInvestigation] = useState<'all' | 'below' | 'incomplete'>('all');
  const rows = value.rows.filter((row) => allowedIds === null || allowedIds.has(row.student.id)).filter((row) => investigation === 'all' || (row.student.indicatorEligible && row.cells.some((cell) =>
    investigation === 'below' ? cell.level === 'below' : cell.state !== 'complete' && cell.state !== 'no-show' && (value.mode === 'regular' || cell.recoveryApplicable === true))));
  const annualVisible = value.period === 'annual' || value.period === 3 || value.mode === 'recovery';
  return <>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo da consulta calculada">
      <Button variant="secondary" className="h-auto justify-start whitespace-normal p-3 text-left" onPress={() => setInvestigation('all')}>{value.statistics.visibleRows} exibidos · {value.statistics.eligibleRows} na população de indicadores</Button>
      <Button variant="secondary" className="h-auto justify-start whitespace-normal p-3 text-left" onPress={() => setInvestigation('below')}>{value.statistics.attentionRows} alunos com resultado completo abaixo do limite</Button>
      <div className="rounded-xl border border-separator p-3 text-sm">{value.statistics.completeCells} de {value.statistics.consideredCells} resultados numéricos completos · {value.statistics.noShowCells} N/C</div>
      <Button variant="secondary" className="h-auto justify-start whitespace-normal p-3 text-left" onPress={() => setInvestigation('incomplete')}>{value.statistics.incompleteCells} resultados pendentes ou indisponíveis</Button>
    </div>
    <p className="text-xs text-muted">Indicadores incluem vínculos atuais sem situação registrada e vínculos “Estava no”. Outras situações podem ser exibidas, mas ficam fora dos indicadores.</p>
    {value.mode === 'recovery' && value.statistics.recoveryUnknownRows ? <p className="text-sm" role="status">{value.statistics.recoveryUnknownRows} aluno(s) têm verificação de recuperação ainda incompleta. Não foram classificados como elegíveis sem evidência.</p> : null}
    {investigation !== 'all' ? <div className="flex items-center gap-3 text-sm" role="status">Investigando: {investigation === 'below' ? 'abaixo do limite' : 'dados incompletos'} · {rows.length} aluno(s)<Button size="sm" variant="ghost" onPress={() => setInvestigation('all')}>Limpar investigação</Button></div> : null}
    <div className="max-w-full overflow-x-auto rounded-xl border border-separator focus-visible:ring-2 focus-visible:ring-focus" tabIndex={0} role="region" aria-label="Matriz de Desempenho; role horizontalmente quando necessário">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{value.classGroup.label} · {value.period === 'annual' ? 'Visão geral' : `${value.period}º trimestre`} · consulta calculada em validação</caption>
        <thead className="bg-default/40"><tr>
          <th scope="col" className="p-2">Nº</th><th scope="col" className="p-2">Situação</th><th scope="col" className="min-w-32 p-2">Aluno</th>
          {value.offers.map((offer) => <th key={offer.id} scope="col" className="max-w-24 break-words p-1 text-center" title={`${offer.subject.label} · ${offer.teacher.label}`}><abbr title={offer.subject.label} aria-label={offer.subject.label} className="no-underline">{columnLabel(offer.subject.label)}</abbr></th>)}
          {annualVisible ? <th scope="col" className="p-2">Resultado calculado</th> : null}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.student.id} className="border-t border-separator hover:bg-default/20">
          <td className="p-2 tabular-nums">{row.student.number}</td><td className="max-w-24 p-2 text-muted">{row.student.statusLabel}</td>
          <th scope="row" className="p-1 font-normal"><Button size="sm" variant="ghost" className="h-auto whitespace-normal break-words text-left" onPress={() => open(row.student.id)}>{row.student.name}</Button></th>
          {row.cells.map((cell, index) => <td key={cell.offerId} className="px-0.5 py-1 text-center"><Button size="sm" variant="ghost" className="h-auto min-w-8 whitespace-normal px-1 py-2 text-xs" aria-label={`${row.student.name}, ${value.offers[index]!.subject.label}, ${valueText(cell.valueMilli)}, ${stateText[cell.state]}`} onPress={() => open(row.student.id, cell.offerId)}><CellValue cell={cell}/></Button></td>)}
          {annualVisible ? <td className="max-w-40 p-2 text-xs">{row.calculatedAnnual?.label ?? (row.calculatedAnnual?.councilEligibility === 'eligible' ? 'Elegível para Conselho' : row.calculatedAnnual?.councilEligibility === 'pending-prior-answer' ? 'Conselho anterior não informado' : '—')}</td> : null}
        </tr>)}</tbody>
      </table>
      {!rows.length ? <p className="p-4 text-sm text-muted">Nenhum aluno neste recorte. Isso não indica, por si só, que todos os resultados estão completos.</p> : null}
    </div>
    <p className="text-xs text-muted">Comparação entre períodos indisponível: a comparabilidade ainda não está contratada para esta leitura. O detalhe do aluno mostra T1, T2 e T3 separadamente, sem atribuir tendência.</p>
    <p className="text-xs text-muted">Leitura em {new Date(value.readAt).toLocaleString('pt-BR')}. Atualização por consulta, não em tempo real. As referências da planilha permanecem separadas dos cálculos.</p>
  </>;
}

export function RelationalPerformancePageV2() {
  const state = useRelationalPerformanceV2();
  const lastFocus = useRef<HTMLElement | null>(null);
  const open = (studentId: number, offerId?: number) => { lastFocus.current = document.activeElement as HTMLElement; void state.open(studentId, offerId); };
  const close = () => { state.closeDetail(); lastFocus.current?.focus(); };
  const lensLabel: Record<PerformanceLensV3, string> = { result: 'Resultado', quantitative: 'Quantitativo', qualitative: 'Qualitativo', assessments: 'Avaliações' };
  const css = 'rounded-xl border border-separator bg-surface px-3 py-2 focus-visible:ring-2 focus-visible:ring-focus';
  if (state.year === null) return <p className="rounded-xl border border-separator p-5">Selecione o ano letivo no topo do Banco para consultar Desempenho.</p>;
  const detail = state.detail;
  return <section aria-label="Desempenho relacional" className="grid min-w-0 grid-cols-1 gap-4">
    <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">Desempenho</h2><Chip size="sm" variant="soft">Consulta calculada · em validação</Chip></div>
      <p className="mt-2 text-sm text-muted">Matriz de leitura sobre as notas importadas. Não é emissão de resultado oficial nem substitui decisões do Conselho.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Turma<select aria-label="Turma" className={css} value={state.filters.classId ?? ''} disabled={state.busy.classes} onChange={(event) => void state.select({ classId: event.target.value ? Number(event.target.value) : null })}><option value="">Selecione a turma</option>{state.classes?.classes.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Período<select aria-label="Período" className={css} value={state.filters.period} onChange={(event) => void state.select({ period: event.target.value === 'annual' ? 'annual' : Number(event.target.value) as PerformancePeriodV2 })}><option value="1">1º trimestre</option><option value="2">2º trimestre</option><option value="3">3º trimestre</option><option value="annual">Visão geral</option></select></label>
      <label className="grid gap-1 text-sm">Modo<select aria-label="Modo" className={css} value={state.filters.mode} onChange={(event) => void state.select({ mode: event.target.value as PerformanceModeV2 })}><option value="regular">Regular</option><option value="recovery">Recuperação</option></select></label>
      <Button variant="secondary" isDisabled={state.busy.matrix || state.filters.classId === null} onPress={() => void state.select({})}>Atualizar consulta</Button>
      {!state.classes && !state.busy.classes ? <Button variant="secondary" onPress={() => void state.loadClasses()}>Tentar carregar turmas</Button> : null}
      {state.classes?.nextOffset !== null && state.classes?.nextOffset !== undefined ? <Button variant="ghost" isDisabled={state.busy.classes} onPress={() => void state.loadClasses(state.classes!.nextOffset!)}>Mais turmas</Button> : null}
    </div>
    {state.classes ? <fieldset className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 rounded-xl border border-separator p-3"><legend className="px-1 text-sm">Situações exibidas</legend>{state.classes.statusOptions.map((value) => <label key={String(value.value)} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={state.filters.statuses.includes(value.value)} disabled={state.filters.statuses.length === 1 && state.filters.statuses[0] === value.value} onChange={(event) => void state.select({ statuses: event.target.checked ? [...state.filters.statuses, value.value] : state.filters.statuses.filter((item) => item !== value.value) })}/>{value.label}</label>)}</fieldset> : null}
    {state.failure ? <Alert status="warning"><Alert.Content><Alert.Title>Consulta não concluída</Alert.Title><Alert.Description>{failures[state.failure]}</Alert.Description></Alert.Content></Alert> : null}
    {state.busy.matrix || state.busy.classes ? <p role="status" className="flex items-center gap-2 text-sm"><Spinner size="sm"/>Carregando leitura…</p> : null}
    {state.filters.classId !== null ? <Tabs selectedKey={state.filters.lens} onSelectionChange={(key) => { if (PERFORMANCE_LENSES_V3.includes(key as PerformanceLensV3)) void state.select({ lens: key as PerformanceLensV3 }); }}>
      <Tabs.List aria-label="Lentes de Desempenho" className="flex flex-wrap">{PERFORMANCE_LENSES_V3.map((lens) => <Tabs.Tab key={lens} id={lens}>{lensLabel[lens]}<Tabs.Indicator/></Tabs.Tab>)}</Tabs.List>
      {PERFORMANCE_LENSES_V3.map((lens) => <Tabs.Panel key={lens} id={lens} className="grid min-w-0 gap-4">
        {state.filters.lens === lens ? <>
          {lens === 'assessments' ? <label className="grid gap-1 text-sm">Componente das avaliações<select aria-label="Componente das avaliações" className={css} value={state.filters.offerId ?? ''} onChange={(event) => void state.select({ offerId: event.target.value ? Number(event.target.value) : null })}><option value="">Selecione o componente</option>{state.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.subject.label} · {offer.teacher.label}</option>)}</select></label> : null}
          {state.analysis ? <PerformanceAnalysisPanelV3 key={`${state.analysis.matrix.readAt}:${JSON.stringify(state.filters)}`} value={state.analysis} open={open} renderResult={(ids) => <Matrix value={state.analysis!.matrix} open={open} allowedIds={ids}/>}/> : null}
        </> : null}
      </Tabs.Panel>)}
    </Tabs> : null}
    <Drawer.Backdrop isOpen={state.detailOpen} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <Drawer.Content placement="right"><Drawer.Dialog className="w-full max-w-full sm:w-[min(48rem,90vw)]">
        <Drawer.CloseTrigger aria-label="Fechar detalhe"/>
        <Drawer.Header><Drawer.Heading>{detail?.operation === 'cell-detail' ? detail.offer.subject.label : detail?.operation === 'student-detail' ? detail.row.student.name : 'Detalhe acadêmico'}</Drawer.Heading></Drawer.Header>
        <Drawer.Body className="flex min-w-0 flex-col gap-4">
          {detail ? <p className="text-xs text-muted">Detalhe consultado em {new Date(detail.readAt).toLocaleString('pt-BR')}. Pode refletir uma importação posterior à matriz.</p> : null}
          {state.busy.detail ? <p role="status">Carregando detalhe…</p> : null}
          {state.detailFailure ? <p role="alert">{failures[state.detailFailure]}</p> : null}
          {detail?.operation === 'student-detail' ? <>
            <p>{detail.row.student.statusLabel} · Nº {detail.row.student.number} · {detail.classGroup.label}</p>
            <p className="text-sm">Conselho anterior: {detail.row.student.councilPrevious === null ? 'Não informado' : detail.row.student.councilPrevious ? 'Sim' : 'Não'}</p>
            {detail.row.formalCouncilDecision ? <p className="text-sm">Decisão humana registrada: <strong>{detail.row.formalCouncilDecision.label}</strong>. Exibida separadamente do cálculo.</p> : null}
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Componente</th><th className="p-2">T1</th><th className="p-2">T2</th><th className="p-2">T3</th></tr></thead><tbody>{detail.trajectory.map((value, index) => <tr key={value.offerId} className="border-t border-separator"><th className="p-2 font-normal">{detail.offers[index]!.subject.label}</th>{value.terms.map((cell, term) => <td key={term} className="p-2"><CellValue cell={cell}/></td>)}</tr>)}</tbody></table></div>
            <Button variant="secondary" onPress={() => { const id = detail.row.student.id; close(); state.openStudent?.(id); }}>Ver cadastro nas Centrais</Button>
          </> : null}
          {detail?.operation === 'cell-detail' ? <>
            <p className="text-sm">{detail.student.name} · {detail.offer.teacher.label}</p>
            {detail.terms.filter((value) => detail.period === 'annual' || value.term === detail.period).map((value) => <section key={value.term} className="grid gap-3 rounded-xl border border-separator p-3">
              <h3 className="font-semibold">{value.term}º trimestre</h3>
              <p className="text-sm">Calculado: <strong>{valueText(value.regular.valueMilli)}</strong> · {stateText[value.regular.state]} · Referência da planilha: {valueText(value.regular.sourceReferenceMilli)}</p>
              <p className="text-xs text-muted">{value.regular.sourceComparison === 'match' ? 'Cálculo e referência coincidem.' : value.regular.sourceComparison === 'mismatch' ? 'Cálculo e referência diferem; não são substituídos silenciosamente.' : 'Comparação com a referência indisponível.'}</p>
              <p className="text-sm">Recuperação: {stateText[value.recovery.state]}{value.recovery.valueMilli === null ? '' : ` · ${valueText(value.recovery.valueMilli)}`}</p>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Avaliação / atividade</th><th className="p-2">Nota</th><th className="p-2">Máximo</th></tr></thead><tbody>{value.instruments.map((instrument) => <tr key={instrument.slot} className="border-t border-separator"><th className="p-2 font-normal">{instrument.label}</th><td className="p-2 tabular-nums">{instrument.valueMilli === null ? 'Sem lançamento' : valueText(instrument.valueMilli)}</td><td className="p-2 tabular-nums">{valueText(instrument.maximumMilli)}</td></tr>)}</tbody></table></div>
              <p className="text-xs text-muted">Quantitativo original: {valueText(value.quantitativeOriginalMilli)} · considerado: {valueText(value.quantitativeConsideredMilli)} · atividades qualitativas: {valueText(value.qualitativeMilli)}. Somas parciais não indicam completude; o estado acima é fornecido pelo núcleo.</p>
              {value.regular.warningCodes.length || value.recovery.warningCodes.length ? <p className="text-sm">O núcleo sinalizou valores ou máximos que precisam ser conferidos. Consulte as notas e os máximos acima e a Auditoria da origem; nenhum valor foi corrigido automaticamente.</p> : null}
            </section>)}
          </> : null}
        </Drawer.Body><Drawer.Footer><Button variant="secondary" onPress={close}>Fechar</Button></Drawer.Footer>
      </Drawer.Dialog></Drawer.Content>
    </Drawer.Backdrop>
  </section>;
}
