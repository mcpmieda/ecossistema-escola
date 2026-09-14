import { useEffect, useId, useRef, useState } from 'react';
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
}: {
  label: string;
  length: 4 | 6;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
}) {
  const id = useId();
  return (
    <div className="pa-credential-field" data-secret={secret || undefined}>
      <label htmlFor={id}>{label}</label>
      <InputOTP
        id={id}
        aria-label={label}
        value={value}
        onChange={(next) => {
          if (/^[0-9]*$/u.test(next)) onChange(next);
        }}
        maxLength={length}
        pattern="^[0-9]*$"
        inputMode="numeric"
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        pushPasswordManagerStrategy="none"
        noScriptCSSFallback={null}
      >
        <InputOTP.Group>
          {Array.from({ length: length === 6 ? 3 : 4 }, (_, index) => (
            <InputOTP.Slot key={index} index={index} />
          ))}
        </InputOTP.Group>
        {length === 6 ? (
          <>
            <InputOTP.Separator />
            <InputOTP.Group>
              {[3, 4, 5].map((index) => (
                <InputOTP.Slot key={index} index={index} />
              ))}
            </InputOTP.Group>
          </>
        ) : null}
      </InputOTP>
    </div>
  );
}

type FlowV1 = ReturnType<typeof createStudentAuthFlowV1>;
function CredentialFormV1({
  state,
  flow,
  sitekey,
  riskMount,
  keepConnected,
  setKeepConnected,
}: {
  state: StudentAuthStateV1;
  flow: FlowV1;
  sitekey: string;
  riskMount?: RiskMountV1;
  keepConnected: boolean;
  setKeepConnected: (value: boolean) => void;
}) {
  const [value, setValue] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [riskToken, setRiskToken] = useState<string | null>(null);
  const [validation, setValidation] = useState<string>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!state.retryAt || state.retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.retryAt]);
  const blocked = !!state.retryAt && state.retryAt > now;
  const needsRisk = state.step === 'risk' || state.needsRisk;
  const length = state.step === 'pin' ? 4 : 6;
  const valid =
    state.step === 'risk' ||
    (value.length === length && (state.step !== 'create' || confirmation.length === 6));
  const submit = () => {
    if (blocked || !valid || (needsRisk && !riskToken)) return;
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
    if (state.step === 'pin') void flow.pin(secret, token);
    else if (state.step === 'password') void flow.login(secret, keepConnected, token);
    else if (state.step === 'create') void flow.activate(secret, repeated, keepConnected);
    else if (state.step === 'risk' && token) void flow.risk(token);
  };
  return (
    <form
      className="pa-auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {state.step === 'pin' ? <p>Informe o ano do seu nascimento.</p> : null}
      {state.step === 'create' ? <p>Crie uma senha numérica com 6 dígitos.</p> : null}
      {state.step !== 'risk' ? (
        <NumericCredentialV1
          label={
            state.step === 'pin'
              ? 'PIN de 4 dígitos'
              : state.step === 'create'
                ? 'Nova senha'
                : 'Senha'
          }
          length={length}
          value={value}
          onChange={setValue}
          secret={state.step !== 'pin'}
        />
      ) : null}
      {state.step === 'create' ? (
        <NumericCredentialV1
          label="Confirmar senha"
          length={6}
          value={confirmation}
          onChange={setConfirmation}
          secret
        />
      ) : null}
      {state.step === 'password' || state.step === 'create' ? (
        <Checkbox isSelected={keepConnected} onChange={setKeepConnected}>
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
      {validation ? <p role="alert">{validation}</p> : null}
      {blocked ? (
        <p role="status">
          Tente novamente em {Math.max(1, Math.ceil((state.retryAt! - now) / 1000))} segundos.
        </p>
      ) : null}
      <Button type="submit" isDisabled={!valid || blocked || (needsRisk && !riskToken)}>
        {state.step === 'create'
          ? 'Criar senha e entrar'
          : state.step === 'password'
            ? 'Entrar'
            : 'Continuar'}
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
}: {
  client: PortalSelfClientV1;
  onAuthenticated: () => void;
  initialQr?: string | null;
  onQrDiscarded?: () => void;
  sitekey: string;
  riskMount?: RiskMountV1;
}) {
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
    const hidden = () => {
      if (document.visibilityState === 'hidden') clear();
    };
    window.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      current.dispose();
      flow.current = null;
      window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [client, initialQr]);
  const titles = {
    scan: 'Acessar minhas notas',
    loading: 'Verificando acesso',
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
          <StudentQrReaderV1
            onQr={(qr) => {
              setInvalidQr(false);
              void flow.current?.begin(qr).catch(() => setInvalidQr(true));
            }}
          />
        ) : null}
        {state.step === 'loading' ? <p role="status">Aguarde…</p> : null}
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
        {state.step !== 'scan' && state.step !== 'authenticated' ? (
          <Button
            variant="tertiary"
            onPress={() => {
              flow.current?.reset();
              discard.current?.();
              setInvalidQr(false);
            }}
          >
            Cancelar e ler outro QR
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}
