/** Max time food may wait in `ready` before system cancel (driver pickup SLA). */
export const READY_PICKUP_WINDOW_MS = 60 * 60 * 1000;

/** Max time to complete delivery after driver pickup (`picked_up` / `on_the_way`). */
export const DELIVERY_SLA_WINDOW_MS = 60 * 60 * 1000;

export const READY_PICKUP_TIMEOUT_REASON = 'Driver did not pick up within 1 hour';
export const READY_PICKUP_TIMEOUT_NOTE = 'Ready pickup timeout (1 hour)';

export const DELIVERY_SLA_TIMEOUT_REASON = 'Delivery not completed within 1 hour';
export const DELIVERY_SLA_TIMEOUT_NOTE = 'Delivery SLA timeout (1 hour)';
