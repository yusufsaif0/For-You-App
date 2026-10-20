const stagedSessions = new Map<string, ApplicationPortalSession>();

export interface ApplicationPortalSession {
  url: string;
  confirmedFields: Record<string, string>;
}

const sensitiveLabel = /\b(password|passcode|otp|one.?time|captcha|verification code|security code|cvv|cvc|card|credit|debit|payment|secret)\b/i;

export function stageApplicationPortalSession(session: ApplicationPortalSession): string {
  if (session.url.length > 2048) {
    throw new Error('The portal link is too long to open safely.');
  }
  const url = new URL(session.url);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Only verified HTTPS portal links can be opened.');
  }

  const confirmedFields = Object.fromEntries(
    Object.entries(session.confirmedFields)
      .filter(([label, value]) =>
        !sensitiveLabel.test(label) &&
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 2000,
      )
      .slice(0, 35),
  );
  const totalLength = Object.entries(confirmedFields)
    .reduce((total, [label, value]) => total + label.length + value.length, 0);
  if (totalLength > 15_000) {
    throw new Error('Too much reviewed information to prepare the portal. Remove some fields and try again.');
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  stagedSessions.set(id, { url: url.href, confirmedFields });
  return id;
}

export function getApplicationPortalSession(id: string): ApplicationPortalSession | null {
  return stagedSessions.get(id) ?? null;
}

export function discardApplicationPortalSession(id: string): void {
  stagedSessions.delete(id);
}
