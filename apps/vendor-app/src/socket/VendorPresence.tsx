import { useAuth } from '../context/AuthContext';
import { useVendorSocket } from './useVendorSocket';

/**
 * Keeps vendor:join alive for the whole logged-in session so the API can set isOpen.
 * Mount once at the app root (not only on Approval Status).
 */
export function VendorPresence() {
  const { accessToken, vendorId } = useAuth();
  useVendorSocket(accessToken, {
    vendorId,
    onApproved: () => undefined,
    onRejected: () => undefined,
  });
  return null;
}
