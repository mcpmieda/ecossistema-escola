import type { ReactNode } from 'react';
import { Label, Tag, TagGroup } from '@heroui/react';
import { CircleCheck, KeyRound, LockKeyhole, LockKeyholeOpen, UserRoundPlus } from 'lucide-react';
import type { AdminAccountReadV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';

export type AccountStateFilterV1 = AdminAccountReadV2['state'];
export type AccountBlockFilterV1 = 'blocked' | 'unblocked';
export const ACCOUNT_STATE_OPTIONS_V1 = [
  {
    id: 'pending-activation',
    label: 'Primeiro acesso',
    icon: <UserRoundPlus size={13} aria-hidden />,
  },
  { id: 'active', label: 'Ativa', icon: <CircleCheck size={13} aria-hidden /> },
  { id: 'reset-required', label: 'Redefinição pendente', icon: <KeyRound size={13} aria-hidden /> },
] as const;
export const ACCOUNT_BLOCK_OPTIONS_V1 = [
  { id: 'blocked', label: 'Bloqueadas', icon: <LockKeyhole size={13} aria-hidden /> },
  { id: 'unblocked', label: 'Sem bloqueio', icon: <LockKeyholeOpen size={13} aria-hidden /> },
] as const;
/** Empty selection means unrestricted. Multiple values are OR within each group, AND across groups. */
export function matchesAccountFiltersV1(
  account: AdminAccountReadV2,
  states: ReadonlySet<string>,
  blocks: ReadonlySet<string>,
) {
  return (
    (!states.size || states.has(account.state)) &&
    (!blocks.size || blocks.has(account.blocked ? 'blocked' : 'unblocked'))
  );
}
export function AccountFilterTagsV1({
  label,
  selected,
  options,
  onChange,
}: {
  label: string;
  selected: Set<string>;
  options: readonly { id: string; label: string; icon: ReactNode }[];
  onChange: (keys: Set<string>) => void;
}) {
  return (
    <TagGroup
      selectionMode="multiple"
      selectedKeys={selected}
      size="sm"
      className="pa-account-filter-tags"
      onSelectionChange={(keys) => {
        const allowed = new Set(options.map((item) => item.id));
        onChange(
          new Set(
            keys === 'all' ? allowed : [...keys].map(String).filter((key) => allowed.has(key)),
          ),
        );
      }}
    >
      <Label>{label}</Label>
      <TagGroup.List>
        {options.map((item) => (
          <Tag key={item.id} id={item.id} textValue={item.label}>
            {item.icon}
            <span>{item.label}</span>
          </Tag>
        ))}
      </TagGroup.List>
    </TagGroup>
  );
}
