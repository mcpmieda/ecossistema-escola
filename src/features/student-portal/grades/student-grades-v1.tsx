import { useMemo, type CSSProperties } from 'react';
import { Card } from '@heroui/react/card';
import { Button } from '@heroui/react/button';
import { MoveHorizontal } from 'lucide-react';
import { Chip } from '@heroui/react/chip';
import { ScrollShadow } from '@heroui/react/scroll-shadow';
import { Table } from '@heroui/react/table';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import './student-grades-v1.css';

type SubjectV1 = SelfResponseV1['subjects'][number];
type PeriodV1 = SubjectV1['periods'][number];
type MarkV1 = PeriodV1['final'];
type PeriodIdV1 = PeriodV1['period'];
const PERIODS_V1: readonly PeriodIdV1[] = ['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'];
const periodLabel = (period: PeriodIdV1) =>
  period.startsWith('REC') ? `REC T${period.slice(-1)}` : period;
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 20 });
const resultLabels = {
  approved: 'Aprovado',
  failed: 'Reprovado',
  'failed-attendance': 'Reprovado por frequência',
} as const;

/** Text/colour mapping only. It never derives a threshold, average, result or new mark. */
export function StudentMarkV1({
  mark,
  showMaximum = false,
}: {
  mark: MarkV1;
  showMaximum?: boolean;
}) {
  if (mark.kind === 'recovery-pending')
    return (
      <Chip size="sm" color="danger" variant="soft" aria-label="Recuperação pendente de nota">
        REC
      </Chip>
    );
  if (mark.kind !== 'score') {
    const label = { absent: 'Ainda não lançado', nc: 'N/C', rr: 'R/R' }[mark.kind];
    return (
      <span className="pa-mark-neutral" aria-label={label}>
        {mark.kind === 'absent' ? '—' : label}
      </span>
    );
  }
  const classification =
    mark.meetsMinimum === true
      ? 'Atinge o mínimo institucional'
      : mark.meetsMinimum === false
        ? 'Abaixo do mínimo institucional'
        : 'Classificação indisponível';
  const value = number.format(mark.value);
  const total = showMaximum && mark.maximum !== null ? number.format(mark.maximum) : null;
  return (
    <span
      className="pa-mark"
      data-minimum={mark.meetsMinimum === null ? 'unknown' : mark.meetsMinimum ? 'met' : 'below'}
      aria-label={`${value}${total === null ? '' : ` de ${total}`}. ${classification}`}
    >
      <span className="pa-mark-value">{value}</span>
      {total === null ? null : <span className="pa-mark-maximum"> / {total}</span>}
    </span>
  );
}

function PeriodCellV1({ period, recovery }: { period?: PeriodV1; recovery: boolean }) {
  if (!period)
    return (
      <span
        className="pa-mark-neutral"
        aria-label={
          recovery ? 'Recuperação não aplicável' : 'Sem informação publicada neste período'
        }
      >
        —
      </span>
    );
  if (!period.partials?.length)
    return (
      <div className="pa-period-final">
        <StudentMarkV1 mark={period.final} />
      </div>
    );
  return (
    <div className="pa-period-detail">
      <dl className="pa-partials">
        {period.partials.map((partial) => (
          <div className="pa-partial" key={partial.assessmentId}>
            <dt>{partial.label}</dt>
            <dd>
              <StudentMarkV1 mark={partial.mark} showMaximum />
            </dd>
          </div>
        ))}
      </dl>
      <div className="pa-period-total">
        <span>Nota do trimestre</span>
        <StudentMarkV1 mark={period.final} />
      </div>
    </div>
  );
}

interface GradeColumnV1 {
  id: 'subject' | 'outcome' | PeriodIdV1;
  label: string;
  width: number;
  minimum: number;
}
function columnsForV1(subjects: readonly SubjectV1[]): GradeColumnV1[] {
  const columns: GradeColumnV1[] = [
    { id: 'subject', label: 'Disciplina', width: 180, minimum: 136 },
  ];
  for (const id of PERIODS_V1) {
    if (!subjects.some((subject) => subject.periods.some((period) => period.period === id)))
      continue;
    const detailed = subjects.some((subject) =>
      subject.periods.some((period) => period.period === id && !!period.partials?.length),
    );
    columns.push({
      id,
      label: periodLabel(id),
      width: detailed ? 290 : 120,
      minimum: detailed ? 230 : 100,
    });
  }
  columns.push({ id: 'outcome', label: 'Resultado', width: 166, minimum: 136 });
  return columns;
}
function OutcomeCellV1({ subject, assisted }: { subject: SubjectV1; assisted: boolean }) {
  if (subject.officialOutcome) return <span>{resultLabels[subject.officialOutcome]}</span>;
  if (assisted)
    return (
      <span className="pa-mark-neutral" aria-label="Sem resultado global para estudante assistido">
        —
      </span>
    );
  return <span className="pa-mark-neutral">Em curso</span>;
}

/** Receives only the already-authorized self payload; no requests, cache or academic arithmetic. */
export function StudentGradesV1({ data }: { data: SelfResponseV1 }) {
  const subjects = useMemo(
    () => [...data.subjects].sort((a, b) => a.order - b.order),
    [data.subjects],
  );
  const columns = useMemo(() => columnsForV1(subjects), [subjects]);
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  if (data.state === 'no-publication' || subjects.length === 0)
    return (
      <Card className="pa-grades-empty">
        <Card.Content>
          <p role="status">Notas ainda não publicadas</p>
        </Card.Content>
      </Card>
    );
  return (
    <Table
      className="pa-grades-table"
      variant="secondary"
      key={`${data.profile.accountId}:${data.revisions.dataVersion}:${data.revisions.policyVersion}:${data.revisions.publicationVersion}`}
    >
      <ScrollShadow
        className="pa-grades-scroll"
        orientation="horizontal"
        size={12}
        tabIndex={0}
        role="region"
        aria-label="Tabela anual de notas, com rolagem horizontal"
      >
        <Table.ResizableContainer
          className="pa-grades-resizable"
          style={{ '--pa-grades-width': `${width}px` } as CSSProperties}
        >
          <Table.Content aria-label="Notas publicadas de 2026" selectionMode="none">
            <Table.Header columns={columns}>
              {(column) => (
                <Table.Column
                  id={column.id}
                  isRowHeader={column.id === 'subject'}
                  defaultWidth={`${column.width}fr`}
                  minWidth={column.minimum}
                  maxWidth={600}
                  textValue={column.label}
                  className={column.id === 'subject' ? 'pa-subject-column' : undefined}
                >
                  {({ startResize }) => (
                    <>
                      <div className="pa-grade-heading">
                        <span>{column.label}</span>
                        <Button
                          className="pa-grade-resize-button"
                          size="sm"
                          variant="ghost"
                          isIconOnly
                          aria-label={`Ajustar largura de ${column.label}`}
                          aria-description="Use as setas e pressione Enter para concluir"
                          onPress={startResize}
                        >
                          <MoveHorizontal size={14} aria-hidden="true" />
                        </Button>
                      </div>
                      <Table.ColumnResizer
                        aria-label={`Redimensionar ${column.label}`}
                        className="pa-grade-resizer"
                      />
                    </>
                  )}
                </Table.Column>
              )}
            </Table.Header>
            <Table.Body items={subjects}>
              {(subject) => (
                <Table.Row id={subject.subjectId} textValue={subject.label} columns={columns}>
                  {(column) => (
                    <Table.Cell className={column.id === 'subject' ? 'pa-subject-cell' : undefined}>
                      {column.id === 'subject' ? (
                        <span className="pa-subject-name">{subject.label}</span>
                      ) : column.id === 'outcome' ? (
                        <OutcomeCellV1
                          subject={subject}
                          assisted={data.profile.academicState === 'assisted'}
                        />
                      ) : (
                        <PeriodCellV1
                          period={subject.periods.find((period) => period.period === column.id)}
                          recovery={column.id.startsWith('REC')}
                        />
                      )}
                    </Table.Cell>
                  )}
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ResizableContainer>
      </ScrollShadow>
    </Table>
  );
}
