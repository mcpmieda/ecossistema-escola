import { StudentSettingsV1, type StudentSettingsPropsV1 } from './student-settings-v1';
import { PersonalizedPublicationV1 } from '../publication/personalized-publication-v1';
import type { PortalAdminReadClientV2 } from '../accounts/accounts-client-v2';
import { PolicyScopeV1 } from './policy-scope-v1';
export function StudentPoliciesV1(
  props: StudentSettingsPropsV1 & { reader: PortalAdminReadClientV2 },
) {
  return (
    <section className="pa-policies" aria-label="Políticas do Portal">
      <PolicyScopeV1 scope={props.scope} label={props.scopeLabel} />
      <StudentSettingsV1
        {...props}
        area="policies"
        publication={
          <PersonalizedPublicationV1
            client={props.client}
            reader={props.reader}
            scope={props.scope}
            scopeLabel={props.scopeLabel}
            canWrite={props.canWrite}
            embedded
          />
        }
      />
    </section>
  );
}
