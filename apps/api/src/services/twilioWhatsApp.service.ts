/**
 * Twilio WhatsApp OTP — used by smsService.sendOtp when TWILIO_* env vars are set.
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID.
 */
import axios, { isAxiosError } from 'axios';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const TWILIO_MESSAGES_URL = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

/** Safe for logs — last 4 digits only. */
export function maskPhoneForLog(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (!d) return '(no digits)';
  if (d.length <= 4) return `****${d}`;
  return `…${d.slice(-4)}`;
}

function sidPrefix(sid: string): string {
  if (!sid) return '(empty)';
  return sid.length <= 10 ? sid : `${sid.slice(0, 10)}…`;
}

function parseTwilioErrorDetail(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const o = data as { message?: string; code?: number | string };
    const parts: string[] = [];
    if (o.code != null) parts.push(`code ${o.code}`);
    if (o.message) parts.push(String(o.message));
    if (parts.length) return parts.join(': ');
  }
  const raw = typeof data === 'string' ? data : JSON.stringify(data);
  const msgXml = raw.match(/<Message>([^<]*)<\/Message>/i);
  const codeXml = raw.match(/<Code>(\d+)<\/Code>/i);
  const parts: string[] = [];
  if (codeXml?.[1]) parts.push(`code ${codeXml[1]}`);
  if (msgXml?.[1]?.trim()) parts.push(msgXml[1].trim());
  return parts.length ? parts.join(': ') : raw.slice(0, 280);
}

/** E.164 from any formatted input, then Twilio WhatsApp address whatsapp:+... */
function toWhatsAppE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const p = digits ? `+${digits}` : phone.startsWith('+') ? phone : `+${phone}`;
  return `whatsapp:${p}`;
}

/**
 * Send OTP via Twilio WhatsApp. No-op if Twilio env vars are missing.
 * @param phone E.164 phone (e.g. +252618889456)
 * @param otp 4-digit OTP code
 */
export async function sendOtpViaTwilioWhatsApp(phone: string, otp: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_MESSAGING_SERVICE_SID } = env;
  const messagingSid = TWILIO_MESSAGING_SERVICE_SID?.trim();

  console.log('[Twilio WhatsApp][debug] sendOtpViaTwilioWhatsApp called', {
    toMasked: maskPhoneForLog(phone),
    accountSidPrefix: sidPrefix(TWILIO_ACCOUNT_SID),
    authTokenLength: TWILIO_AUTH_TOKEN?.length ?? 0,
    hasMessagingServiceSid: Boolean(messagingSid),
    whatsappFromSet: Boolean(TWILIO_WHATSAPP_FROM?.trim()),
  });

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[Twilio WhatsApp] Skipped: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set');
    return;
  }
  if (!messagingSid && !TWILIO_WHATSAPP_FROM?.trim()) {
    console.warn('[Twilio WhatsApp] Skipped: set TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID');
    return;
  }

  let from: string | undefined;
  if (!messagingSid) {
    const fromNum = TWILIO_WHATSAPP_FROM.replace(/\D/g, '');
    if (!fromNum) {
      throw new AppError(
        {
          en: 'TWILIO_WHATSAPP_FROM is missing or invalid in .env (use E.164, e.g. +14155238886).',
          de: 'TWILIO_WHATSAPP_FROM in .env fehlt oder ist ungültig (E.164, z. B. +14155238886).',
        },
        503,
        'CONFIG_ERROR'
      );
    }
    from = toWhatsAppE164(fromNum);
  }

  const to = toWhatsAppE164(phone);
  const body = `Your verification code is: ${otp}. Valid for 10 minutes.`;

  const params = new URLSearchParams();
  if (messagingSid) {
    params.set('MessagingServiceSid', messagingSid);
  } else if (from) {
    params.set('From', from);
  }
  params.set('To', to);
  params.set('Body', body);

  console.log('[Twilio WhatsApp][debug] POST Messages.json', {
    urlAccount: sidPrefix(TWILIO_ACCOUNT_SID),
    usingMessagingService: Boolean(messagingSid),
    messagingServiceSidPrefix: messagingSid ? sidPrefix(messagingSid) : undefined,
    from: from ?? '(MessagingServiceSid)',
    to,
    bodyLength: body.length,
  });

  try {
    const { data } = await axios.post<Record<string, string | undefined>>(
      TWILIO_MESSAGES_URL(TWILIO_ACCOUNT_SID),
      params,
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      }
    );
    const raw = data as Record<string, unknown>;
    const sid = typeof raw?.sid === 'string' ? raw.sid : undefined;
    const status = typeof raw?.status === 'string' ? raw.status : undefined;
    const errCode = raw?.error_code;
    const errMsg = raw?.error_message;
    console.log('[Twilio WhatsApp][debug] API response JSON keys:', data != null && typeof data === 'object' ? Object.keys(data as object) : typeof data);
    console.log('[Twilio WhatsApp] API accepted message.', { sid, status, error_code: errCode, error_message: errMsg });
    if (errCode != null || errMsg != null) {
      console.warn('[Twilio WhatsApp][debug] Twilio included error fields on 2xx body — check Console:', { error_code: errCode, error_message: errMsg });
    }
    console.log(
      '[Twilio WhatsApp] Delivery: if the chat never appears, the recipient must join your WhatsApp sandbox from that phone (Console → Messaging → Try WhatsApp → follow “join” steps). Check Monitor → Logs → Messaging for delivery errors.'
    );
  } catch (err: unknown) {
    if (isAxiosError(err)) {
      console.error('[Twilio WhatsApp][debug] axios error', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        dataPreview:
          typeof err.response?.data === 'string'
            ? (err.response.data as string).slice(0, 500)
            : JSON.stringify(err.response?.data ?? '').slice(0, 500),
      });
    }
    const detail = isAxiosError(err)
      ? parseTwilioErrorDetail(err.response?.data) || err.message
      : err instanceof Error
        ? err.message
        : String(err);
    console.error('[Twilio WhatsApp] API error:', isAxiosError(err) ? err.response?.status : undefined, detail);

    // 63007: no WhatsApp channel for this From / account (wrong credentials, or WhatsApp not enabled on this project).
    if (detail.includes('63007')) {
      throw new AppError(
        {
          en:
            'Twilio error 63007: WhatsApp sender is not available for this Account SID. The user phone (e.g. +91…) is not the cause. Fix: (1) In Twilio Console use the same project as TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN. (2) Open Messaging → Try WhatsApp and ensure WhatsApp is enabled; copy the exact sandbox “From” shown (often +14155238886) into TWILIO_WHATSAPP_FROM. (3) Or create a Messaging Service with a WhatsApp sender and set TWILIO_MESSAGING_SERVICE_SID. (4) Recipient must join the sandbox from their WhatsApp first.',
          de:
            'Twilio-Fehler 63007: Kein WhatsApp-Kanal für diese Account-SID. Die Nutzer-Rufnummer (+91…) ist nicht die Ursache. Lösung: (1) Gleiches Twilio-Projekt wie SID/Token. (2) Messaging → WhatsApp aktivieren; exakte Sandbox-Absendernummer eintragen (oft +14155238886). (3) Oder Messaging Service mit WhatsApp-Absender und TWILIO_MESSAGING_SERVICE_SID. (4) Empfänger muss der Sandbox beitreten.',
        },
        502,
        'OTP_DELIVERY_FAILED',
        { provider: 'twilio_whatsapp', twilioCode: 63007 }
      );
    }

    throw new AppError(
      {
        en: `Could not send OTP via WhatsApp. ${detail ? `(${detail})` : 'Check Twilio credentials and WhatsApp sender.'}`,
        de: `OTP konnte nicht per WhatsApp gesendet werden. ${detail ? `(${detail})` : 'Twilio-Zugang und WhatsApp-Absender prüfen.'}`,
      },
      502,
      'OTP_DELIVERY_FAILED',
      { provider: 'twilio_whatsapp' }
    );
  }
}
