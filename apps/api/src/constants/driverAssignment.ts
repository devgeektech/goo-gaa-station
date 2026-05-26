/**
 * Time window for a driver to accept after vendor accepts the order.
 * Orders stay `accepted` until this deadline; cancel via assignment timeout worker if unassigned.
 */
export const DRIVER_ASSIGNMENT_WINDOW_MS = 2 * 60 * 1000;
