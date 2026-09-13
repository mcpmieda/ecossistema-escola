import { useCallback, useState } from 'react';
import { Button, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import type { PortalClassCatalogV2, ClassCatalogPageV2 } from './accounts-client-v2';
import { useAccountsReadV1 } from './accounts-read-v1';
import { AccountsErrorV1 } from './accounts-presentation-v1';

export function ClassFilterV1({
  catalog,
  selected,
  onChange,
}: {
  catalog: PortalClassCatalogV2;
  selected: { id: number; label: string } | null;
  onChange: (item: { id: number; label: string } | null) => void;
}) {
  const [search, setSearch] = useState('');
  return (
    <div className="pa-account-class-filter">
      <TextField value={search} onChange={setSearch}>
        <Label>Buscar turma no catálogo de 2026</Label>
        <Input maxLength={80} />
      </TextField>
      <ClassResultsV1
        key={search}
        catalog={catalog}
        search={search}
        selected={selected}
        onChange={onChange}
      />
    </div>
  );
}
function ClassResultsV1({
  catalog,
  search,
  selected,
  onChange,
}: {
  catalog: PortalClassCatalogV2;
  search: string;
  selected: { id: number; label: string } | null;
  onChange: (item: { id: number; label: string } | null) => void;
}) {
  const [prior, setPrior] = useState<ClassCatalogPageV2['items']>([]);
  const [offset, setOffset] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => catalog(offset, search, signal),
    [catalog, offset, search],
  );
  const read = useAccountsReadV1(load);
  const current = read.state.state === 'ready' ? read.state.data : null;
  const items = [
    ...new Map(
      [...(selected ? [selected] : []), ...prior, ...(current?.items ?? [])].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
  return (
    <>
      <Select
        selectedKey={selected ? String(selected.id) : 'all'}
        onSelectionChange={(key) => {
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
          <ListBox>
            <ListBox.Item id="all" textValue="Todas as turmas">
              Todas as turmas
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
      {read.state.state === 'error' && (
        <AccountsErrorV1
          error={read.state.error}
          canReload={read.canReload}
          onReload={read.reload}
        />
      )}
      {(read.state.state === 'idle' || read.state.state === 'loading') && (
        <p role="status">Consultando catálogo de turmas…</p>
      )}
      {current && current.items.length === 0 && <p>Nenhuma turma encontrada nesta busca.</p>}
      {current?.nextOffset !== null && current?.nextOffset !== undefined && (
        <Button
          variant="secondary"
          onPress={() => {
            setPrior(items);
            setOffset(current.nextOffset!);
          }}
        >
          Carregar mais turmas
        </Button>
      )}
      <p>Catálogo do Banco de 2026, incluindo turmas sem contas no Portal.</p>
    </>
  );
}
