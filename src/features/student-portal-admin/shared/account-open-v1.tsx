import { createContext, useContext, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import { allowDraftNavigationV1 } from '../../../shared/forms/draft-navigation-v1';
export const AccountOpenContextV1 = createContext<
  ((accountId: string, parentScope?: ScopeV1) => void) | null
>(null);
export function StudentNameV1({
  accountId,
  name,
  parentScope,
  children,
}: {
  accountId: string;
  name: string;
  parentScope?: ScopeV1;
  children?: ReactNode;
}) {
  const open = useContext(AccountOpenContextV1);
  return open ? (
    <Button
      variant="ghost"
      size="sm"
      className="pa-student-name"
      aria-label={'Abrir ficha de ' + name}
      onPress={() => {
        if (allowDraftNavigationV1()) open(accountId, parentScope);
      }}
    >
      {children ?? name}
    </Button>
  ) : (
    <span>{children ?? name}</span>
  );
}
