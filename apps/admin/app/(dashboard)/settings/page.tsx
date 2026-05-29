'use client';

import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { getErrorMessage } from '@/lib/api/client';
import { getAppSettings, updateAppSettings } from '@/lib/api/appSettings.api';

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'SOS', 'ETB', 'KES', 'AED', 'SAR'] as const;

const COMMON_TIMEZONES = [
  'UTC',
  'Africa/Mogadishu',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Riyadh',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
] as const;

export default function GeneralSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [defaultTimezone, setDefaultTimezone] = useState('UTC');
  const [serviceZonesText, setServiceZonesText] = useState('');

  useEffect(() => {
    setLoading(true);
    getAppSettings()
      .then((res) => {
        const d = res.data;
        setDefaultCurrency((d?.defaultCurrency ?? 'USD').toString().toUpperCase());
        setDefaultTimezone((d?.defaultTimezone ?? 'UTC').toString());
        setServiceZonesText(Array.isArray(d?.serviceZones) ? d.serviceZones.join('\n') : '');
      })
      .catch((e) => toast.push({ title: 'Failed to load settings', description: getErrorMessage(e), variant: 'danger' }))
      .finally(() => setLoading(false));
  }, [toast]);

  const onSave = async () => {
    const code = defaultCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      toast.push({ title: 'Currency must be a 3-letter ISO code (e.g. USD)', variant: 'warning' });
      return;
    }
    const tz = defaultTimezone.trim();
    if (!tz) {
      toast.push({ title: 'Timezone is required', variant: 'warning' });
      return;
    }
    const zones = serviceZonesText
      .split(/\r?\n/)
      .map((z) => z.trim())
      .filter(Boolean);
    if (zones.length > 80) {
      toast.push({ title: 'At most 80 service zones', variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await updateAppSettings({
        defaultCurrency: code,
        defaultTimezone: tz,
        serviceZones: zones,
      });
      toast.push({ title: 'General settings saved', variant: 'success' });
    } catch (e) {
      toast.push({ title: 'Save failed', description: getErrorMessage(e), variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>General settings</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Basic platform configuration for MVP (currency, timezone, service zones). Delivery fee and commission remain on{' '}
            <a href="/fees" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Fees &amp; Commission
            </a>
            .
          </div>
        </div>
        <SlidersHorizontal size={28} className="muted" aria-hidden style={{ flexShrink: 0 }} />
      </div>

      <div className="card">
        <div className="cardBody" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <div className="field">
            <div className="label">Default currency (ISO 4217)</div>
            <input
              className="input"
              list="admin-common-currencies"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="USD"
              disabled={loading || saving}
              autoCapitalize="characters"
            />
            <datalist id="admin-common-currencies">
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Used for labels and future pricing rules; does not change existing order totals.
            </div>
          </div>

          <div className="field">
            <div className="label">Default timezone (IANA)</div>
            <input
              className="input"
              list="admin-common-timezones"
              value={defaultTimezone}
              onChange={(e) => setDefaultTimezone(e.target.value)}
              placeholder="UTC"
              disabled={loading || saving}
            />
            <datalist id="admin-common-timezones">
              {COMMON_TIMEZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Platform-wide reference; vendor-specific hours still use each vendor&apos;s timezone where configured.
            </div>
          </div>

          <div className="field">
            <div className="label">Service zones</div>
            <textarea
              className="input"
              value={serviceZonesText}
              onChange={(e) => setServiceZonesText(e.target.value)}
              placeholder={'City center\nNorth district\nAirport area'}
              rows={6}
              disabled={loading || saving}
              style={{ minHeight: 120, resize: 'vertical' }}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              One zone per line (MVP reference for ops and future delivery rules). Max 80 zones, 120 characters each.
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btnPrimary" onClick={() => void onSave()} disabled={loading || saving}>
              {saving ? 'Saving…' : 'Save general settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
