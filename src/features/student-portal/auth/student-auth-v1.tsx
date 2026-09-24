import { useEffect, useId, useRef, useState, type CSSProperties, type Ref, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Checkbox } from '@heroui/react/checkbox';
import { InputOTP } from '@heroui/react/input-otp';
import { Label } from '@heroui/react/label';
import { Check, CircleX, Info, ShieldCheck, TimerReset, WifiOff, CloudOff } from 'lucide-react';
import type { PortalSelfClientV1 } from '../shared/self-client-v1';
import {
  createStudentAuthFlowV1,
  INITIAL_AUTH_STATE_V1,
  type StudentAuthStateV1,
} from './auth-flow-v1';
import { StudentQrReaderV1 } from './qr-reader-v1';
import { StudentRiskWidgetV1, type RiskMountV1 } from './turnstile-widget-v1';
import './student-auth-v1.css';

const SECRET_REVEAL_MS_V1 = 1200;

function NumericCredentialV1({
  label,
  length,
  value,
  onChange,
  secret = false,
  disabled = false,
  inputRef,
  onComplete,
  autoFocus = false,
}: Readonly<{
  label: string;
  length: 4 | 6;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onComplete?: () => void;
  autoFocus?: boolean;
}>) {
  const id = useId();
  // The first field of each step takes the focus, so the phone opens its number keyboard at once.
  const own = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) own.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  // Secret digits: only the one just typed shows, and it turns into * after a short pause, on
  // deletion or when the field loses focus.
  const [revealed, setRevealed] = useState<number | null>(null);
  useEffect(() => {
    if (revealed === null) return;
    const timer = setTimeout(() => setRevealed(null), SECRET_REVEAL_MS_V1);
    return () => clearTimeout(timer);
  }, [revealed, value]);
  const slot = (index: number) => (
    <InputOTP.Slot
      key={index}
      index={index}
      aria-hidden={secret || undefined}
      data-masked={(secret && index !== revealed) || undefined}
    />
  );
  return (
    <div className="pa-credential-field" data-secret={secret || undefined}>
      <Label htmlFor={id}>{label}</Label>
      <InputOTP
        ref={(node: HTMLInputElement | null) => {
          own.current = node;
          if (typeof inputRef === 'function') inputRef(node);
          else if (inputRef) inputRef.current = node;
        }}
        onComplete={onComplete}
        id={id}
        isDisabled={disabled}
        onBlur={() => setRevealed(null)}
        aria-label={label}
        value={value}
        onChange={(next) => {
          if (!/^\d*$/u.test(next)) return;
          setRevealed(next.length > value.length ? next.length - 1 : null);
          onChange(next);
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
  if (step === 'pin') return 'Ano de nascimento';
  if (step === 'create') return 'Nova senha';
  return 'Senha de 6 números';
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

/*
 * The flow's messages stay the contract (auth-flow-v1); the screen restates them as a short,
 * calm card. Wrong credentials stay generic on purpose: nothing says whether the card or the
 * number was wrong.
 */
type NoticeToneV1 = 'wrong' | 'wait' | 'down' | 'net' | 'info';
function noticeOfV1(message: string): { tone: NoticeToneV1; title: string; text: string } {
  if (message.startsWith('Muitas tentativas'))
    return {
      tone: 'wait',
      title: 'Muitas tentativas seguidas',
      text: 'Por segurança, o portal pausou as tentativas por alguns segundos. Assim que o tempo acabar, é só tentar de novo.',
    };
  if (message.startsWith('O serviço de acesso'))
    return {
      tone: 'down',
      title: 'O portal está em uma pausa rápida',
      text: 'Não é nada com você nem com o seu cartão. Tente de novo em alguns minutos.',
    };
  if (message.startsWith('Não foi possível conectar'))
    return {
      tone: 'net',
      title: 'Sem conexão com a internet',
      text: 'Confira o Wi-Fi ou os dados móveis e tente de novo.',
    };
  if (message.startsWith('Não foi possível entrar'))
    return {
      tone: 'wrong',
      title: 'Não deu certo',
      text: 'Confira os números e tente de novo.',
    };
  return { tone: 'info', title: message, text: '' };
}

const NOTICE_ICONS_V1 = { wrong: CircleX, wait: TimerReset, down: CloudOff, net: WifiOff, info: Info };

function AuthNoticeV1({ message }: { message: string }) {
  const notice = noticeOfV1(message);
  const Icon = NOTICE_ICONS_V1[notice.tone];
  return (
    <div className={'pa-auth-notice pa-auth-notice--' + notice.tone} role="alert">
      <span className="pa-auth-notice-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <div>
        <b>{notice.title}</b>
        {notice.text ? <span>{notice.text}</span> : null}
      </div>
    </div>
  );
}

/** Seconds until the server accepts another try, with a ring that empties as time passes. */
function RetryCountdownV1({ retryAt }: { retryAt: number }) {
  const [now, setNow] = useState(Date.now);
  const [total] = useState(() => Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)));
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  if (retryAt <= now) return null;
  const seconds = Math.max(1, Math.ceil((retryAt - now) / 1000));
  return (
    <output className="pa-auth-countdown">
      <span
        className="pa-auth-countdown-ring"
        style={{ '--pa-countdown': `${Math.round((100 * seconds) / total)}%` } as CSSProperties}
        aria-hidden="true"
      >
        <i>{seconds}s</i>
      </span>
      <span>Tente novamente em {seconds} segundos.</span>
    </output>
  );
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

function KeepConnectedV1({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const hint = useId();
  return (
    <div className="pa-keep-connected">
      <Checkbox isDisabled={disabled} isSelected={value} onChange={onChange} aria-describedby={hint}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Label>Manter conectado neste celular</Label>
        </Checkbox.Content>
      </Checkbox>
      <p id={hint}>
        Marque só se o celular for seu: assim você não precisa digitar a senha toda vez. Em
        aparelho emprestado, deixe desmarcado.
      </p>
    </div>
  );
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
  confirmationInput: RefObject<HTMLInputElement | null>;
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
      {state.step === 'pin' ? (
        <Card.Description>Para confirmar que é você, digite o ano em que você nasceu.</Card.Description>
      ) : null}
      {state.step === 'create' ? (
        <Card.Description>
          Escolha 6 números fáceis de lembrar para você e difíceis para os outros. Evite 123456 e a
          sua data de nascimento.
        </Card.Description>
      ) : null}
      {showCredential ? (
        <NumericCredentialV1
          label={credentialLabelV1(state.step)}
          length={length}
          value={value}
          onChange={setValue}
          onComplete={
            state.step === 'create' ? () => confirmationInput.current?.focus() : undefined
          }
          // Only the sign-in password is hidden; while creating one the student sees both
          // fields to compare them (owner decision).
          secret={state.step === 'password'}
          disabled={state.pending}
          autoFocus
        />
      ) : null}
      {showConfirmation ? (
        <NumericCredentialV1
          label="Confirmar senha"
          inputRef={confirmationInput}
          length={6}
          value={confirmation}
          onChange={setConfirmation}
          disabled={state.pending}
        />
      ) : null}
      {showKeepConnected ? (
        <KeepConnectedV1 value={keepConnected} onChange={setKeepConnected} disabled={state.pending} />
      ) : null}
      {needsRisk ? (
        <div className="pa-risk-frame">
          <StudentRiskWidgetV1 sitekey={sitekey} onToken={setRiskToken} mount={riskMount} />
        </div>
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
  // The security check alone needs nothing else from the student: continue as soon as it passes
  // (the button stays as a fallback).
  const autoSubmit = useRef(submit);
  autoSubmit.current = submit;
  useEffect(() => {
    if (state.step === 'risk' && riskToken) autoSubmit.current();
  }, [state.step, riskToken]);
  return (
    <form
      className={'pa-auth-form' + (state.message && state.step !== 'risk' ? ' pa-auth-form--retry' : '')}
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
      {validation ? <p role="alert" className="pa-auth-validation">{validation}</p> : null}
      {blocked ? <RetryCountdownV1 retryAt={state.retryAt!} /> : null}
      <Button
        type="submit"
        size="lg"
        className="pa-auth-submit"
        data-pending={state.pending || undefined}
        isDisabled={state.pending || !valid || blocked || (needsRisk && !riskToken)}
      >
        {submitLabelV1(state)}
      </Button>
      {state.step === 'risk' ? (
        <p className="pa-risk-note">
          <Info size={15} aria-hidden="true" />
          <span>
            Essa verificação aparece de vez em quando, por exemplo depois de várias tentativas ou
            numa conexão nova. Não é um erro.
          </span>
        </p>
      ) : null}
    </form>
  );
}

const STEPS_V1: Partial<Record<StudentAuthStateV1['step'], { eyebrow: string; index?: number }>> = {
  scan: { eyebrow: 'Passo 1 · Seu cartão', index: 1 },
  pin: { eyebrow: 'Passo 2 · Quem é você', index: 2 },
  create: { eyebrow: 'Passo 3 · Sua senha', index: 3 },
  password: { eyebrow: 'Seja bem-vindo' },
  risk: { eyebrow: 'Só um instante' },
};

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
  // Off by default (owner decision): a shared or borrowed phone must not stay signed in.
  const [keepConnected, setKeepConnected] = useState(false);
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
    password: 'Digite sua senha',
    risk: 'Verificação rápida',
    create: 'Criar senha',
    authenticated: 'Acesso confirmado',
  };
  const step = STEPS_V1[state.step];
  return (
    <Card className="pa-auth-card" data-step={state.step}>
      <Card.Header className="pa-auth-header">
        {step ? <Card.Description className="pa-auth-eyebrow">{step.eyebrow}</Card.Description> : null}
        <Card.Title className="pa-auth-title">{titles[state.step]}</Card.Title>
        {step?.index ? (
          <div className="pa-auth-progress" aria-hidden="true">
            {[1, 2, 3].map((item) => (
              <span key={item} data-done={item <= step.index! || undefined} />
            ))}
          </div>
        ) : null}
        {state.step === 'password' ? (
          <span className="pa-auth-card-read">
            <Check size={14} strokeWidth={3} aria-hidden="true" />
            Cartão lido
          </span>
        ) : null}
      </Card.Header>
      <Card.Content>
        {invalidQr ? <AuthNoticeV1 message="Este QR não é um acesso válido ao Portal." /> : null}
        {!invalidQr && state.message ? <AuthNoticeV1 message={state.message} /> : null}
        {state.step === 'risk' ? (
          <div className="pa-risk-intro">
            <span className="pa-risk-shield" aria-hidden="true">
              <ShieldCheck size={30} />
            </span>
            <Card.Description>
              Para proteger sua conta, precisamos confirmar que é você mesmo usando o portal. Leva
              só alguns segundos.
            </Card.Description>
          </div>
        ) : null}
        {state.step === 'scan' ? (
          <fieldset
            className="pa-qr-controls"
            disabled={state.pending}
            aria-busy={state.pending || undefined}
          >
            {state.retryAt ? <RetryCountdownV1 retryAt={state.retryAt} /> : null}
            <StudentQrReaderV1
              onQr={(qr) => {
                setInvalidQr(false);
                void flow.current?.begin(qr).catch(() => setInvalidQr(true));
              }}
            />
            {state.pending ? (
              <output className="pa-qr-read">Cartão lido! Preparando a entrada…</output>
            ) : null}
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
            {state.step === 'scan' ? 'Cancelar' : 'Usar outro cartão'}
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}
