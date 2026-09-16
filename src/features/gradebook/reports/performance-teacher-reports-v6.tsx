import { useState } from 'react';
import { Alert, Button, Card, Label, ListBox, Select, Skeleton } from '@heroui/react';
import type { PerformancePeriodV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { usePerformanceAnalyticsV6 } from '../performance/use-performance-analytics-v6';
import { PerformanceTeacherExportV6 } from '../performance/performance-teacher-export-v6';
import { analyticsPeriodV6 } from '../performance/analytics-format-v6';

export function PerformanceTeacherReportsV6({
  classId,
  period,
  isActive,
}: {
  classId: number | null;
  period: PerformancePeriodV2;
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(false),
    [selected, setSelected] = useState<number | null>(null);
  const state = usePerformanceAnalyticsV6(classId, period, expanded && isActive);
  const teacher =
    state.data?.teachers.find((item) => item.id === selected) ?? state.data?.teachers[0];
  return (
    <Card>
      <Card.Header className="flex-row flex-wrap items-center justify-between gap-3">
        <Card.Title>Relatório do professor</Card.Title>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={classId === null}
          aria-expanded={expanded}
          onPress={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Recolher' : 'Abrir relatório docente'}
        </Button>
      </Card.Header>
      {expanded ? (
        <Card.Content className="grid gap-3">
          <span className="text-xs text-muted">
            {state.data?.classGroup.label ?? 'Turma selecionada'} · {analyticsPeriodV6(period)}
          </span>
          {state.failure ? (
            <Alert status="warning">
              <Alert.Content>
                <Alert.Title>
                  {state.data ? 'Exibindo a última leitura' : 'Consulta indisponível'}
                </Alert.Title>
              </Alert.Content>
            </Alert>
          ) : null}
          {state.data && teacher ? (
            <div className="flex flex-wrap items-end gap-3">
              <Select
                className="w-full max-w-sm"
                selectedKey={String(teacher.id)}
                onSelectionChange={(key) => {
                  if (key !== null) setSelected(Number(key));
                }}
              >
                <Label>Professor do relatório</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover isNonModal>
                  <ListBox>
                    {state.data.teachers.map((item) => (
                      <ListBox.Item id={String(item.id)} key={item.id} textValue={item.label}>
                        {item.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <PerformanceTeacherExportV6 value={state.data} teacherId={teacher.id} />
            </div>
          ) : state.busy ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : (
            <span className="text-sm text-muted">Nenhum professor neste recorte.</span>
          )}
        </Card.Content>
      ) : null}
    </Card>
  );
}
