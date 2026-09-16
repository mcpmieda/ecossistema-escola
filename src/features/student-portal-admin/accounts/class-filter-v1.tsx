import { allowDraftNavigationV1 } from '../../../shared/forms/draft-navigation-v1';
import { useCallback } from 'react';
import { Label, ListBox, Select } from '@heroui/react';
import type { PortalClassCatalogV2, ClassCatalogPageV2 } from './accounts-client-v2';
import { useAccountsReadV1 } from './accounts-read-v1';
import { AccountsErrorV1 } from './accounts-presentation-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';

/** Complete, bounded catalog. Repeated cursors and silent truncation are rejected. */
export async function readClassOptionsV1(catalog: PortalClassCatalogV2, signal: AbortSignal) {
  const items: ClassCatalogPageV2['items'] = [],
    seen = new Set<number>();
  let offset = 0;
  for (let page = 0; page < 100; page++) {
    signal.throwIfAborted();
    const result = await catalog(offset, '', signal);
    for (const item of result.items) {
      if (seen.has(item.id)) throw new PortalClientErrorV1('invalid-response');
      seen.add(item.id);
      items.push(item);
    }
    if (result.nextOffset === null) return items;
    if (result.nextOffset <= offset || !Number.isSafeInteger(result.nextOffset))
      throw new PortalClientErrorV1('invalid-response');
    offset = result.nextOffset;
  }
  throw new PortalClientErrorV1('unavailable');
}

export function ClassFilterV1({
  catalog,
  selected,
  onChange,
  disabled = false,
  allLabel = 'Todas as turmas',
}: {
  catalog: PortalClassCatalogV2;
  disabled?: boolean;
  allLabel?: string;
  selected: { id: number; label: string } | null;
  onChange: (item: { id: number; label: string } | null) => void;
}) {
  const load = useCallback((signal: AbortSignal) => readClassOptionsV1(catalog, signal), [catalog]);
  const read = useAccountsReadV1(load);
  const data = read.state.state === 'ready' ? read.state.data : [];
  const items =
    selected && !data.some((item) => item.id === selected.id) ? [selected, ...data] : data;
  return (
    <div className="pa-account-class-filter">
      <Select
        isDisabled={disabled}
        className="w-full max-w-64"
        selectedKey={selected ? String(selected.id) : 'all'}
        onSelectionChange={(key) => {
          if (!allowDraftNavigationV1()) return;
          if (key === 'all') onChange(null);
          else {
            const item = items.find((item) => String(item.id) === key);
            if (item) onChange(item);
          }
        }}
      >
        <Label>Turma</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox aria-label="Turmas">
            <ListBox.Item id="all" textValue={allLabel}>
              {allLabel}
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {items.map((item) => (
              <ListBox.Item key={item.id} id={String(item.id)} textValue={item.label}>
                {item.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {read.state.state === 'error' ? (
        <AccountsErrorV1
          error={read.state.error}
          canReload={read.canReload}
          onReload={read.reload}
        />
      ) : null}
      {read.state.state === 'loading' || read.state.state === 'idle' ? (
        <span role="status" className="text-xs text-muted">
          Carregando turmas…
        </span>
      ) : null}
    </div>
  );
}
