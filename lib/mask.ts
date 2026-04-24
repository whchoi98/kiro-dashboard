export function maskText(text: string): string {
  if (!text || text.length <= 2) return text;
  return text.slice(0, 2) + '*'.repeat(text.length - 2);
}

export function maskEmail(email: string): string {
  if (!email) return email;
  const atIdx = email.indexOf('@');
  if (atIdx < 0) return maskText(email);

  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);

  const maskedLocal = local.length <= 2 ? local : local.slice(0, 2) + '*'.repeat(local.length - 2);
  const maskedDomain = domain.length <= 2 ? domain : domain.slice(0, 2) + '*'.repeat(domain.length - 2);

  return `${maskedLocal}@${maskedDomain}`;
}
