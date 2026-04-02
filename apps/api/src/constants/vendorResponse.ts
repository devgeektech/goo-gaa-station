/**
 * Time window for the vendor to accept or reject after an order enters `vendor_notified`.
 * Currently 5 minutes for testing; switch to `2 * 60 * 1000` for the production 2-minute window.
 */
export const VENDOR_RESPONSE_WINDOW_MS = 5 * 60 * 1000;
