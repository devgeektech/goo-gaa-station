import { AppError } from './AppError';

export function formatBlockReason(blockReason?: string | null): string {
  const trimmed = blockReason?.trim();
  return trimmed || 'Your account has been blocked.';
}

export function createAccountBlockedError(blockReason?: string | null): AppError {
  const reason = formatBlockReason(blockReason);
  return new AppError(
    {
      en: `Account blocked: ${reason}`,
      de: `Konto gesperrt: ${reason}`,
    },
    403,
    'ACCOUNT_BLOCKED',
    { blockReason: reason }
  );
}
