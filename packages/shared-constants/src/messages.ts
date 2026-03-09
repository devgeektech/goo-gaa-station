export const MESSAGES = {
  AUTH: {
    en: {
      loginSuccess: 'Login successful',
      loginFailed: 'Invalid email or password',
      logoutSuccess: 'Logged out successfully',
      tokenExpired: 'Token has expired',
      unauthorized: 'Unauthorized access',
      invalidToken: 'Invalid token',
      refreshTokenInvalid: 'Invalid or expired refresh token',
      refreshTokenExpired: 'Refresh token has expired',
    },
    de: {
      loginSuccess: 'Anmeldung erfolgreich',
      loginFailed: 'Ungültige E-Mail oder Passwort',
      logoutSuccess: 'Erfolgreich abgemeldet',
      tokenExpired: 'Token ist abgelaufen',
      unauthorized: 'Unbefugter Zugriff',
      invalidToken: 'Ungültiger Token',
      refreshTokenInvalid: 'Ungültiger oder abgelaufener Refresh-Token',
      refreshTokenExpired: 'Refresh-Token ist abgelaufen',
    },
  },
  USER: {
    en: {
      created: 'User created successfully',
      updated: 'User updated successfully',
      notFound: 'User not found',
      alreadyExists: 'User already exists',
      deleted: 'User deleted successfully',
    },
    de: {
      created: 'Benutzer erfolgreich erstellt',
      updated: 'Benutzer erfolgreich aktualisiert',
      notFound: 'Benutzer nicht gefunden',
      alreadyExists: 'Benutzer existiert bereits',
      deleted: 'Benutzer erfolgreich gelöscht',
    },
  },
  DRIVER: {
    en: {
      created: 'Driver created successfully',
      updated: 'Driver updated successfully',
      notFound: 'Driver not found',
      approvalPending: 'Driver approval pending',
      approved: 'Driver approved',
      rejected: 'Driver rejected',
    },
    de: {
      created: 'Fahrer erfolgreich erstellt',
      updated: 'Fahrer erfolgreich aktualisiert',
      notFound: 'Fahrer nicht gefunden',
      approvalPending: 'Fahrer-Genehmigung ausstehend',
      approved: 'Fahrer genehmigt',
      rejected: 'Fahrer abgelehnt',
    },
  },
  ORDER: {
    en: {
      created: 'Order created successfully',
      updated: 'Order updated successfully',
      notFound: 'Order not found',
      cancelled: 'Order cancelled',
      statusUpdated: 'Order status updated',
    },
    de: {
      created: 'Bestellung erfolgreich erstellt',
      updated: 'Bestellung erfolgreich aktualisiert',
      notFound: 'Bestellung nicht gefunden',
      cancelled: 'Bestellung storniert',
      statusUpdated: 'Bestellstatus aktualisiert',
    },
  },
  PAYMENT: {
    en: {
      success: 'Payment successful',
      failed: 'Payment failed',
      pending: 'Payment pending',
      refunded: 'Payment refunded',
      initFailed: 'Payment initiation failed',
    },
    de: {
      success: 'Zahlung erfolgreich',
      failed: 'Zahlung fehlgeschlagen',
      pending: 'Zahlung ausstehend',
      refunded: 'Zahlung erstattet',
      initFailed: 'Zahlungsauslösung fehlgeschlagen',
    },
  },
  GENERAL: {
    en: {
      serverError: 'Internal server error',
      badRequest: 'Bad request',
      notFound: 'Resource not found',
      validationError: 'Validation error',
    },
    de: {
      serverError: 'Interner Serverfehler',
      badRequest: 'Ungültige Anfrage',
      notFound: 'Ressource nicht gefunden',
      validationError: 'Validierungsfehler',
    },
  },
} as const;
