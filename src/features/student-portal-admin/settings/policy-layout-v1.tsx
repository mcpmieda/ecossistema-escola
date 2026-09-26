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
    description: 'Permissão para entrar. As datas de acesso ficam em Calendário.',
    fields: ['accessEnabled'],
  },
  {
    id: 'grades',
    label: 'Notas',
    icon: NotebookPen,
    title: 'Notas e publicação',
    description: 'Escolha o conteúdo e publique as notas de cada período.',
    fields: ['showPartials', 'autoUpdate', 'allowedPeriods'],
  },
  {
    id: 'closing',
    label: 'Fechamento',
    icon: GraduationCap,
    title: 'Fechamento e resultado',
    description: 'Defina o que o aluno vê sobre o trimestre e o resultado anual.',
    fields: ['showTermClosing', 'termClosingConclusive', 'showFinalResult'],
  },
  {
    id: 'calendar',
    label: 'Calendário',
    icon: CalendarDays,
    title: 'Datas e horários',
    description: 'Acesso, ano letivo e divulgação. Horário de Brasília.',
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
  publication,
  disabled,
}: {
  field: (name: SettingsFieldV1) => ReactNode;
  publication?: ReactNode;
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
          <div className="pa-settings-fields">{category.fields.map(field)}</div>
          {category.id === 'grades' && publicationVisited ? (
            <LiveRefreshScopeV1 active={selected === 'grades'}>{publication}</LiveRefreshScopeV1>
          ) : null}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
