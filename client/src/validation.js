// Shared, reusable validation helpers used across every form in the app.
// Each validate* function returns an empty string when the value is valid,
// or a human-readable warning message when it is not.

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(value, label = 'Name') {
  const v = (value ?? '').trim();
  if (!v) return `${label} is required.`;
  if (v.length < 2) return `${label} must be at least 2 characters.`;
  if (v.length > 60) return `${label} must be 60 characters or fewer.`;
  if (!/^[a-zA-Z\u00C0-\u017F\s.'-]+$/.test(v)) return `${label} can only contain letters, spaces, and . ' -`;
  return '';
}

export function validateEmail(value, { required = true } = {}) {
  const v = (value ?? '').trim();
  if (!v) return required ? 'Email is required.' : '';
  if (v.length > 254) return 'Email is too long.';
  if (!EMAIL_REGEX.test(v)) return 'Enter a valid email address, e.g. you@company.com.';
  return '';
}

// Returns a score (0-5), which requirements are met, a label, a colour and a percent for a strength bar.
export function passwordStrength(value) {
  const v = value ?? '';
  const checks = {
    length: v.length >= 8,
    lower: /[a-z]/.test(v),
    upper: /[A-Z]/.test(v),
    number: /[0-9]/.test(v),
    special: /[^A-Za-z0-9]/.test(v)
  };
  const score = Object.values(checks).filter(Boolean).length;
  const levels = [
    { label: 'Very weak', color: '#df4c5e' },
    { label: 'Weak', color: '#df4c5e' },
    { label: 'Fair', color: '#e0a531' },
    { label: 'Good', color: '#e0a531' },
    { label: 'Strong', color: '#20b486' },
    { label: 'Very strong', color: '#1c9978' }
  ];
  const { label, color } = levels[score];
  return { score, checks, label, color, percent: (score / 5) * 100 };
}

export function validatePassword(value, { minLength = 8 } = {}) {
  const v = value ?? '';
  if (!v) return 'Password is required.';
  if (v.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (!/[a-z]/.test(v)) return 'Password needs at least one lowercase letter.';
  if (!/[A-Z]/.test(v)) return 'Password needs at least one uppercase letter.';
  if (!/[0-9]/.test(v)) return 'Password needs at least one number.';
  if (!/[^A-Za-z0-9]/.test(v)) return "Password needs at least one special character, e.g. ! @ # $.";
  return '';
}

export function validateConfirmPassword(password, confirm) {
  if (!confirm) return 'Please confirm your password.';
  if (password !== confirm) return 'Passwords do not match.';
  return '';
}

export function validateRequired(value, label = 'This field') {
  if (value === undefined || value === null || String(value).trim() === '') return `${label} is required.`;
  return '';
}

export function validateDate(value, { label = 'Date', allowPast = true } = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${label} must be a valid date.`;
  if (!allowPast) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return `${label} cannot be in the past.`;
  }
  return '';
}

export function validateMaxLength(value, max, label = 'This field') {
  if ((value ?? '').length > max) return `${label} must be ${max} characters or fewer.`;
  return '';
}
