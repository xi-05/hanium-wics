export const PASSWORD_RULE_MESSAGE =
  "비밀번호는 8자 이상이며 영문, 숫자, 특수문자(~!@#$%^&*)를 각각 하나 이상 포함해야 합니다.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[~!@#$%^&*])[A-Za-z\d~!@#$%^&*]{8,}$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function validatePassword(password: string): string | null {
  if (!PASSWORD_PATTERN.test(password)) return PASSWORD_RULE_MESSAGE;
  return null;
}
