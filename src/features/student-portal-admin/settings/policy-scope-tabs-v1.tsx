import { useCallback, useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { Tabs } from '@heroui/react';
import {
  SHIFT_LABELS_V1,
  type PolicyScopeV1,
} from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminReadClientV2 } from '../accounts/accounts-client-v2';
import { useAccountsReadV1 } from '../accounts/accounts-read-v1';
import { AccountsErrorV1 } from '../accounts/accounts-presentation-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { LiveReadNoticeV1 } from '../../../shared/live-data/live-read-notice-v1';
import { ClassTabsV1 } from '../../../shared/ui/class-tabs-v1';

type ShiftV1 = Extract<PolicyScopeV1, { kind: 'shift' }>['shift'];
type Props = ComponentProps<typeof ClassTabsV1> & {
  reader: PortalAdminReadClientV2;
  selectedShift: ShiftV1 | null;
  onShiftChange: (shift: ShiftV1 | null) => void;
};

/** Turnos only select policy scope; account and publication operations keep their own scopes. */
export function PolicyScopeTabsV1({ reader, selectedShift, onShiftChange, ...props }: Props) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await reader.query(
        {
          contractVersion: 2,
          operation: 'shifts-read',
          scope: { kind: 'school', academicYear: 2026 },
          page: { limit: 100 },
        },
        signal,
      );
      if (result.state !== 'shifts-read') throw new PortalClientErrorV1('invalid-response');
      return result.items;
    },
    [reader],
  );
  const read = useAccountsReadV1(load);
  const shifts = read.state.state === 'ready' ? read.state.data : [];
  const unavailableSelection = useRef<ShiftV1 | null>(null);
  useEffect(() => {
    if (read.state.state !== 'ready' || read.state.refreshError) return;
    if (!selectedShift || read.state.data.some((item) => item.shift === selectedShift)) {
      unavailableSelection.current = null;
      return;
    }
    if (unavailableSelection.current === selectedShift) return;
    unavailableSelection.current = selectedShift;
    // The owner applies the existing unsaved-draft guard before changing scope.
    onShiftChange(null);
  }, [read.state, selectedShift, onShiftChange]);
  const selected = selectedShift ?? (props.selectedId === null ? 'all' : String(props.selectedId));
  return (
    <Tabs
      className="school-class-tabs"
      selectedKey={selected}
      keyboardActivation="manual"
      onSelectionChange={(key) => {
        const shift = shifts.find((item) => item.shift === key);
        if (shift) onShiftChange(shift.shift);
        else if (key === 'all' || props.items.some((item) => String(item.id) === key))
          props.onChange(key === 'all' ? null : Number(key));
      }}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="Alcance das políticas">
          <Tabs.Tab id="all">
            Toda a escola
            <Tabs.Indicator />
          </Tabs.Tab>
          {shifts.map((item) => (
            <Tabs.Tab key={item.shift} id={item.shift}>
              Turno {SHIFT_LABELS_V1[item.shift]}
              {' · '}
              {item.classes.length} {item.classes.length === 1 ? 'turma' : 'turmas'}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
          {props.items.map((item) => (
            <Tabs.Tab key={item.id} id={String(item.id)}>
              {item.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id={selected} className="school-class-content">
        {read.state.state === 'error' ? (
          <AccountsErrorV1
            error={read.state.error}
            canReload={read.canReload}
            onReload={read.reload}
          />
        ) : null}
        <LiveReadNoticeV1 failed={Boolean(read.refreshError)} />
        {props.children}
      </Tabs.Panel>
    </Tabs>
  );
}

export function PortalScopeTabsV1(props: Props & { policies: boolean; children?: ReactNode }) {
  const { policies, reader, selectedShift, onShiftChange, ...classProps } = props;
  return policies ? (
    <PolicyScopeTabsV1
      {...classProps}
      reader={reader}
      selectedShift={selectedShift}
      onShiftChange={onShiftChange}
    />
  ) : (
    <ClassTabsV1 {...classProps} />
  );
}
