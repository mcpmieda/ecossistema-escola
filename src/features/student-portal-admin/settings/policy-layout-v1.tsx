import { useState, type ReactNode } from 'react';
import { Tabs } from '@heroui/react';
import { CalendarDays, DoorOpen, GraduationCap, NotebookPen, ShieldCheck } from 'lucide-react';
import type { SettingsFieldV1 } from './settings-values-v1';
import { LiveRefreshScopeV1 } from '../../../shared/live-data/live-refresh-scope-v1';

const categories = [
  {
    id: 'access',
    label: 'Acesso',
    icon: DoorOpen,
    title: 'Entrada no Portal',
    description: 'Abra ou feche o Portal agora e agende as próximas aberturas e fechamentos.',
    fields: ['accessEnabled'],
  },
  {
    id: 'grades',
    label: 'Notas',
    icon: NotebookPen,
    title: 'Notas',
    description: 'Publique as notas de cada período e escolha quando os alunos as veem.',
    fields: [],
  },
  {
    id: 'closing',
    label: 'Relatório de notas',
    icon: GraduationCap,
    title: 'Relatório de notas',
    description: 'A orientação por disciplina que o aluno lê sobre o trimestre.',
    fields: ['showTermClosing', 'termClosingConclusive'],
  },
  {
    id: 'calendar',
    label: 'Calendário',
    icon: CalendarDays,
    title: 'Datas e horários',
    description: 'Ano letivo e trimestres. Notas e resultado anual ficam na aba Notas. Horário de Brasília.',
    fields: ['calendar'],
  },
  {
    id: 'security',
    label: 'Segurança',
    icon: ShieldCheck,
    title: 'Sessões e proteção',
    description: 'Tempo de conexão e limites para tentativas de entrada.',
    fields: ['risk'],
  },
] as const;

export function PolicyLayoutV1({
  field,
  grades,
  disabled,
}: {
  field: (name: SettingsFieldV1) => ReactNode;
  /** The Notas tab: periods (publication and agenda), Resultado anual and options. */
  grades?: ReactNode;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string>('access');
  const [publicationVisited, setPublicationVisited] = useState(false);
  return (
    <Tabs
      className="pa-policy-tabs"
      selectedKey={selected}
      onSelectionChange={(key) => {
        setSelected(String(key));
        if (key === 'grades') setPublicationVisited(true);
      }}
    >
      <Tabs.ListContainer className="pa-policy-navigation">
        <Tabs.List aria-label="Categorias de políticas">
          {categories.map(({ id, label, icon: Icon }) => (
            <Tabs.Tab key={id} id={id} isDisabled={disabled}>
              <Icon size={16} aria-hidden />
              {label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {categories.map((category) => (
        <Tabs.Panel key={category.id} id={category.id} shouldForceMount className="pa-policy-panel">
          <header className="pa-policy-intro">
            <h2>{category.title}</h2>
            <p>{category.description}</p>
          </header>
          {category.fields.length ? (
            <div className="pa-settings-fields">{category.fields.map(field)}</div>
          ) : null}
          {category.id === 'grades' && publicationVisited ? (
            <LiveRefreshScopeV1 active={selected === 'grades'}>
              <div className="pa-grades">{grades}</div>
            </LiveRefreshScopeV1>
          ) : null}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
