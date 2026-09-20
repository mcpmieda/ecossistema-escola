import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Checkbox } from '@heroui/react/checkbox';
import { InputOTP } from '@heroui/react/input-otp';
import { Label } from '@heroui/react/label';
import type { PortalSelfClientV1 } from '../shared/self-client-v1';
import {
  createStudentAuthFlowV1,
  INITIAL_AUTH_STATE_V1,
  type StudentAuthStateV1,
} from './auth-flow-v1';
import { StudentQrReaderV1 } from './qr-reader-v1';
import { StudentRiskWidgetV1, type RiskMountV1 } from './turnstile-widget-v1';
import './student-auth-v1.css';

function NumericCredentialV1({
  label,
  length,
  value,
  onChange,
  secret = false,
  disabled = false,
  inputRef,
  onComplete,
}: Readonly<{
  label: string;
  length: 4 | 6;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onComplete?: () => void;
}>) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const slot = (index: number) => (
    <InputOTP.Slot
      key={index}
      index={index}
      aria-hidden={secret || undefined}
      data-masked={(secret && (!focused || index < value.length - 2)) || undefined}
    />
  );
  return (
    <div className="pa-credential-field" data-secret={secret || undefined}>
      <label htmlFor={id}>{label}</label>
      <InputOTP
        ref={inputRef}
        onComplete={onComplete}
        id={id}
        isDisabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={label}
        value={value}
        onChange={(next) => {
          if (/^\d*$/u.test(next)) onChange(next);
        }}
        maxLength={length}
        pattern="^\d*$"
        inputMode="numeric"
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        pushPasswordManagerStrategy="none"
        noScriptCSSFallback={null}
      >
        <InputOTP.Group>
          {Array.from({ length: length === 6 ? 3 : 4 }, (_, index) => slot(index))}
        </InputOTP.Group>
        {length === 6 ? (
          <>
            <InputOTP.Separator />
            <InputOTP.Group>{[3, 4, 5].map((index) => slot(index))}</InputOTP.Group>
          </>
        ) : null}
      </InputOTP>
    </div>
  );
}

type FlowV1 = ReturnType<typeof createStudentAuthFlowV1>;

function credentialLabelV1(step: StudentAuthStateV1['step']) {
  if (step === 'pin') return 'PIN de 4 dígitos';
  if (step === 'create') return 'Nova senha';
  return 'Senha';
}

function submitLabelV1(state: StudentAuthStateV1) {
  if (state.pending) {
    if (state.step === 'password') return 'Entrando…';
    if (state.step === 'create') return 'Criando senha…';
    return 'Validando…';
  }
  if (state.step === 'create') return 'Criar senha e entrar';
  if (state.step === 'password') return 'Entrar';
  return 'Continuar';
}

function dispatchCredentialV1(
  state: StudentAuthStateV1,
  flow: FlowV1,
  secret: string,
  repeated: string,
  keepConnected: boolean,
  token?: string,
) {
  if (state.step === 'pin') return flow.pin(secret, token);
  if (state.step === 'password') return flow.login(secret, keepConnected, token);
  if (state.step === 'create') return flow.activate(secret, repeated, keepConnected);
  if (state.step === 'risk' && token) return flow.risk(token);
  return Promise.resolve();
}
function CredentialFieldsV1({
  state,
  value,
  confirmation,
  setValue,
  setConfirmation,
  confirmationInput,
  keepConnected,
  setKeepConnected,
  sitekey,
  riskMount,
  setRiskToken,
}: Readonly<{
  state: StudentAuthStateV1;
  value: string;
  confirmation: string;
  setValue: (value: string) => void;
  setConfirmation: (value: string) => void;
  confirmationInput: Ref<HTMLInputElement>;
  keepConnected: boolean;
  setKeepConnected: (value: boolean) => void;
  sitekey: string;
  riskMount?: RiskMountV1;
  setRiskToken: (value: string | null) => void;
}>) {
  const showCredential = state.step !== 'risk';
  const showConfirmation = state.step === 'create';
  const showKeepConnected = state.step === 'password' || state.step === 'create';
  const needsRisk = state.step === 'risk' || state.needsRisk;
  const length = state.step === 'pin' ? 4 : 6;
  return (
    <>
      {state.step === 'pin' ? <p>Informe o ano do seu nascimento.</p> : null}
      {state.step === 'create' ? <p>Crie uma senha numérica com 6 dígitos.</p> : null}
      {showCredential ? (
        <NumericCredentialV1
          label={credentialLabelV1(state.step)}
          length={length}
          value={value}
          onChange={setValue}
          onComplete={
            state.step === 'create'
              ? () => (confirmationInput as { current: HTMLInputElement | null }).current?.focus()
              : undefined
          }
          secret={state.step !== 'pin'}
          disabled={state.pending}
        />
      ) : null}
      {showConfirmation ? (
        <NumericCredentialV1
          label="Confirmar senha"
          inputRef={confirmationInput}
          length={6}
          value={confirmation}
          onChange={setConfirmation}
          secret
          disabled={state.pending}
        />
      ) : null}
      {showKeepConnected ? (
        <Checkbox
          isDisabled={state.pending}
          isSelected={keepConnected}
          onChange={setKeepConnected}
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Label>Manter conectado</Label>
          </Checkbox.Content>
        </Checkbox>
      ) : null}
      {needsRisk ? (
        <StudentRiskWidgetV1 sitekey={sitekey} onToken={setRiskToken} mount={riskMount} />
      ) : null}
    </>
  );
}

function credentialValidV1(
  state: StudentAuthStateV1,
  value: string,
  confirmation: string,
) {
  if (state.step === 'risk') return true;
  const length = state.step === 'pin' ? 4 : 6;
  if (value.length !== length) return false;
  return state.step !== 'create' || confirmation.length === 6;
}

function CredentialFormV1({
  state,
  flow,
  sitekey,
  riskMount,
  keepConnected,
  setKeepConnected,
}: Readonly<{
  state: StudentAuthStateV1;
  flow: FlowV1;
  sitekey: string;
  riskMount?: RiskMountV1;
  keepConnected: boolean;
  setKeepConnected: (value: boolean) => void;
}>) {
  const [value, setValue] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [riskToken, setRiskToken] = useState<string | null>(null);
  const [validation, setValidation] = useState<string>();
  const confirmationInput = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!state.retryAt || state.retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.retryAt]);
  const blocked = !!state.retryAt && state.retryAt > now;
  const needsRisk = state.step === 'risk' || state.needsRisk;
  const valid = credentialValidV1(state, value, confirmation);
  const submit = () => {
    if (state.pending || blocked || !valid || (needsRisk && !riskToken)) return;
    if (state.step === 'create' && value !== confirmation) {
      setValidation('As senhas precisam ser iguais.');
      return;
    }
    const secret = value,
      repeated = confirmation,
      token = riskToken ?? undefined;
    setValue('');
    setConfirmation('');
    setRiskToken(null);
    setValidation(undefined);
    void dispatchCredentialV1(state, flow, secret, repeated, keepConnected, token);
  };
  return (
    <form
      className="pa-auth-form"
      aria-busy={state.pending || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <CredentialFieldsV1
        state={state}
        value={value}
        confirmation={confirmation}
        setValue={setValue}
        setConfirmation={setConfirmation}
        confirmationInput={confirmationInput}
        keepConnected={keepConnected}
        setKeepConnected={setKeepConnected}
        sitekey={sitekey}
        riskMount={riskMount}
        setRiskToken={setRiskToken}
      />
      {validation ? <p role="alert">{validation}</p> : null}
      {blocked ? (
        <output>
          Tente novamente em {Math.max(1, Math.ceil((state.retryAt! - now) / 1000))} segundos.
        </output>
      ) : null}
      <Button
        type="submit"
        isDisabled={state.pending || !valid || blocked || (needsRisk && !riskToken)}
      >
        {submitLabelV1(state)}
      </Button>
    </form>
  );
}

export function StudentAuthenticationV1({
  client,
  onAuthenticated,
  initialQr,
  onQrDiscarded,
  sitekey,
  riskMount,
}: Readonly<{
  client: PortalSelfClientV1;
  onAuthenticated: () => void;
  initialQr?: string | null;
  onQrDiscarded?: () => void;
  sitekey: string;
  riskMount?: RiskMountV1;
}>) {
  const [state, setState] = useState(INITIAL_AUTH_STATE_V1);
  const [keepConnected, setKeepConnected] = useState(true);
  const [invalidQr, setInvalidQr] = useState(false);
  const flow = useRef<FlowV1 | null>(null);
  const success = useRef(onAuthenticated);
  success.current = onAuthenticated;
  const discard = useRef(onQrDiscarded);
  discard.current = onQrDiscarded;
  useEffect(() => {
    const current = createStudentAuthFlowV1(client, setState, () => {
      discard.current?.();
      success.current();
    });
    flow.current = current;
    if (initialQr) void current.begin(initialQr).catch(() => setInvalidQr(true));
    const clear = () =>
      flushSync(() => {
        current.reset();
        discard.current?.();
      });
    window.addEventListener('pagehide', clear);
    return () => {
      current.dispose();
      flow.current = null;
      window.removeEventListener('pagehide', clear);
    };
  }, [client, initialQr]);
  const titles = {
    scan: 'Acessar minhas notas',
    pin: 'Primeiro acesso',
    password: 'Entrar',
    risk: 'Verificação de segurança',
    create: 'Criar senha',
    authenticated: 'Acesso confirmado',
  };
  return (
    <Card className="pa-auth-card">
      <Card.Header>
        <h2 className="pa-auth-title">{titles[state.step]}</h2>
      </Card.Header>
      <Card.Content>
        {invalidQr || state.message ? (
          <Alert status="warning" role="alert">
            <Alert.Content>
              <Alert.Description>
                {invalidQr ? 'Este QR não é um acesso válido ao Portal.' : state.message}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {state.step === 'scan' ? (
          <fieldset
            className="pa-qr-controls"
            disabled={state.pending}
            aria-busy={state.pending || undefined}
          >
            <StudentQrReaderV1
              onQr={(qr) => {
                setInvalidQr(false);
                void flow.current?.begin(qr).catch(() => setInvalidQr(true));
              }}
            />
            {state.pending ? <output>Preparando entrada…</output> : null}
          </fieldset>
        ) : null}
        {['pin', 'password', 'risk', 'create'].includes(state.step) && flow.current ? (
          <CredentialFormV1
            key={state.revision}
            state={state}
            flow={flow.current}
            sitekey={sitekey}
            riskMount={riskMount}
            keepConnected={keepConnected}
            setKeepConnected={setKeepConnected}
          />
        ) : null}
        {state.step !== 'authenticated' && (state.step !== 'scan' || state.pending) ? (
          <Button
            variant="tertiary"
            onPress={() => {
              flow.current?.reset();
              discard.current?.();
              setInvalidQr(false);
            }}
          >
            Cancelar
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}
