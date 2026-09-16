import { useState } from 'react';
import { Button, Drawer } from '@heroui/react';
import type { CustomizationRowV1 } from '../../../../shared/student-portal-contracts/customizations-v1';
import { AccountDetailV1, type AccountDetailPropsV1 } from '../accounts/account-detail-v1';
import { PersonalizedPublicationV1 } from '../publication/personalized-publication-v1';
import { StudentSettingsV1 } from './student-settings-v1';
import { allowDraftNavigationV1 } from '../../../shared/forms/draft-navigation-v1';
import type { CustomizationAreaV1 } from './customization-values-v1';

type Props = Omit<AccountDetailPropsV1, 'accountId' | 'parentScope' | 'initialSlot'> & {
  row: CustomizationRowV1;
  area: CustomizationAreaV1;
};
/** Students use the exact existing six-slot account drawer. A class has its own scope,
 * never an invented student identity or a second copy of the publication editor. */
export function CustomizationTargetV1(props: Props) {
  const [area, setArea] = useState(props.area);
  const { row, client, reader, canWrite, onClose, onChanged } = props;
  if (row.scope.kind === 'account') return (
    <AccountDetailV1 {...props} accountId={row.scope.accountId}
      parentScope={{ kind: 'school', academicYear: 2026 }} initialSlot={props.area} />
  );
  const close = () => { if (allowDraftNavigationV1()) onClose(); };
  return (
    <Drawer.Backdrop isOpen onOpenChange={(open) => { if (!open) close(); }}>
      <Drawer.Content placement="right">
        <Drawer.Dialog aria-label="Configurações da turma" className="pa-student-drawer">
          <Drawer.Header className="flex-row items-center justify-between">
            <Drawer.Heading>{row.label}</Drawer.Heading>
            <Button size="sm" variant="ghost" onPress={close}>Fechar</Button>
          </Drawer.Header>
          <Drawer.Body>
            {area === 'publication' ? <PersonalizedPublicationV1 client={client} reader={reader}
              scope={row.scope} scopeLabel={row.label} canWrite={canWrite}
              onOpenSettings={() => { if (allowDraftNavigationV1()) setArea('settings'); }} />
              : <StudentSettingsV1 client={client} scope={row.scope} scopeLabel={row.label}
                canWrite={canWrite} onCommitted={onChanged} />}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
