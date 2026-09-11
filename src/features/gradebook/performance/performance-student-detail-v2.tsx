import { useLayoutEffect, useRef } from 'react';
import { Avatar, Button, Drawer, Table } from '@heroui/react';
import { UserRound } from 'lucide-react';
import type { PerformancePeriodV2, PerformanceReadyV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { GradeValue, gradeText } from './performance-display-v2';

type Detail = Extract<PerformanceReadyV2, { operation: 'student-detail' | 'cell-detail' }>;
export function PerformanceStudentDetailV2({ detail, focusPeriod, openComponent, openCenter }: {
  readonly detail: Detail;
  readonly focusPeriod: PerformancePeriodV2;
  readonly openComponent: (studentId: number, offerId: number) => void;
  readonly openCenter: (studentId: number) => void;
}) {
  const focusedTerm = useRef<HTMLElement | null>(null);
  const student = detail.operation === 'student-detail' ? detail.row.student : detail.student;
  const visibleTerms = detail.operation === 'student-detail' ? ([0, 1, 2] as const).filter((index) =>
    detail.trajectory.some((offering) => offering.terms[index].valueMilli !== null)) : [];
  useLayoutEffect(() => {
    if (detail.operation === 'cell-detail' && focusPeriod !== 'annual') {
      focusedTerm.current?.scrollIntoView?.({ behavior: 'auto', block: 'start' });
    }
  }, [detail, focusPeriod]);
  return <>
    <Drawer.Header className="border-b border-separator pb-5 pr-10">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar size="lg" className="size-16 shrink-0" aria-label="Foto de perfil padrão"><Avatar.Fallback><UserRound size={34} aria-hidden="true"/></Avatar.Fallback></Avatar>
        <div className="min-w-0">
          <Drawer.Heading className="break-words text-2xl font-bold tracking-tight">{student.name}</Drawer.Heading>
          <p className="mt-1 text-lg font-semibold">{detail.classGroup.name ?? detail.classGroup.label}</p>
          {detail.operation === 'cell-detail' ? <p className="mt-1 text-sm">{detail.offer.subject.label} · {detail.offer.teacher.label}</p> : null}
          <p className="mt-1 text-xs text-muted">Atualizado em {new Date(detail.readAt).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
    </Drawer.Header>
    <Drawer.Body className="flex min-w-0 flex-col gap-5 pt-5">
      {detail.operation === 'student-detail' ? <>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span>Nº {student.number}</span>
          {student.status !== null ? <span>{student.statusLabel}</span> : null}
        </div>
        {detail.row.formalCouncilDecision ? <p className="text-sm font-medium">{detail.row.formalCouncilDecision.label}</p> : null}
        {visibleTerms.length ? <Table><Table.ScrollContainer><Table.Content aria-label="Notas do aluno por trimestre">
          <Table.Header><Table.Column id="component" isRowHeader>Componente</Table.Column>{visibleTerms.map((index) => <Table.Column key={index} id={`term-${index}`}>{index + 1}º trimestre</Table.Column>)}</Table.Header>
          <Table.Body>{detail.trajectory.map((offering, index) => <Table.Row id={offering.offerId} key={offering.offerId}>
            <Table.Cell><Button size="sm" variant="ghost" className="h-auto whitespace-normal text-left" onPress={() => openComponent(student.id, offering.offerId)}>{detail.offers[index]!.subject.label}</Button></Table.Cell>
            {visibleTerms.map((term) => <Table.Cell key={term}><GradeValue cell={offering.terms[term]}/></Table.Cell>)}
          </Table.Row>)}</Table.Body>
        </Table.Content></Table.ScrollContainer></Table> : <p className="text-sm text-muted">Nenhuma nota lançada.</p>}
      </> : <>
        {detail.terms.filter((term) => term.hasGrades ?? (term.instruments.some((value) => value.valueMilli !== null) || term.regular.valueMilli !== null || term.recovery.valueMilli !== null || term.recovery.state === 'no-show' || term.recovery.state === 'repeat-failure')).map((term) => {
          const instruments = term.instruments.filter((instrument) => instrument.slot !== 3 || term.showParallel === true);
          return <section key={term.term} aria-label={`${term.term}º trimestre`} ref={(element) => { if (term.term === focusPeriod) focusedTerm.current = element; }} className="rounded-xl border border-separator p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">{term.term}º trimestre</h3>
              <div className="flex items-center gap-3"><span className="text-xs text-muted">Nota do trimestre</span><GradeValue cell={term.regular} prominent/></div>
            </div>
            <Table><Table.Content aria-label={`Avaliações do ${term.term}º trimestre`}>
              <Table.Header><Table.Column id="activity" isRowHeader>Avaliação / atividade</Table.Column><Table.Column id="grade">Nota</Table.Column><Table.Column id="maximum">Máximo</Table.Column></Table.Header>
              <Table.Body>{instruments.map((instrument) => <Table.Row key={instrument.slot} id={instrument.slot}>
                <Table.Cell>{instrument.label}</Table.Cell><Table.Cell className="font-medium tabular-nums">{gradeText(instrument.valueMilli)}</Table.Cell><Table.Cell className="tabular-nums text-muted">{gradeText(instrument.maximumMilli)}</Table.Cell>
              </Table.Row>)}</Table.Body>
            </Table.Content></Table>
            {term.showRecovery === true ? <div className="mt-4 flex items-center justify-between border-t border-separator pt-3"><span className="text-sm font-medium">Recuperação final</span><GradeValue cell={term.recovery}/></div> : null}
          </section>;
        })}
        {!detail.terms.some((term) => term.hasGrades ?? term.instruments.some((value) => value.valueMilli !== null)) ? <p className="text-sm text-muted">Nenhuma nota lançada.</p> : null}
      </>}
      <Button variant="secondary" className="self-start" onPress={() => openCenter(student.id)}>Ver cadastro nas Centrais</Button>
    </Drawer.Body>
  </>;
}
