import { format } from 'date-fns';

/** Admin UI currency display — defaults to USD ($). Legacy EUR from API is shown as USD. */
export function formatMoney(amount: number, currency = 'USD') {
  const displayCurrency = currency === 'EUR' ? 'USD' : currency;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

export function capitalizeFirst(value: string | null | undefined): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatVehicleType(type: string | null | undefined): string {
  if (!type) return '—';
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'yyyy-MM-dd HH:mm');
}

export function truncateId(id: string, chars = 8) {
  if (!id) return '—';
  if (id.length <= chars * 2) return id;
  return `${id.slice(0, chars)}…${id.slice(-chars)}`;
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

