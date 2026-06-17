'use client';

import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { getErrorMessage } from '@/lib/api/client';
import { getAppSettings, updateAppSettings } from '@/lib/api/appSettings.api';
import { useTranslations } from '@/lib/i18n/useTranslations';

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
  const t = useTranslations();
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
      .catch((e) => toast.push({ title: t.settings.loadFailed, description: getErrorMessage(e), variant: 'danger' }))
      .finally(() => setLoading(false));
  }, [toast, t.settings.loadFailed]);

  const onSave = async () => {
    const code = defaultCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      toast.push({ title: t.settings.validationCurrency, variant: 'warning' });
      return;
    }
    const tz = defaultTimezone.trim();
    if (!tz) {
      toast.push({ title: t.settings.validationTimezone, variant: 'warning' });
      return;
    }
    const zones = serviceZonesText
      .split(/\r?\n/)
      .map((z) => z.trim())
      .filter(Boolean);
    if (zones.length > 80) {
      toast.push({ title: t.settings.maxZones, variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await updateAppSettings({
        defaultCurrency: code,
        defaultTimezone: tz,
        serviceZones: zones,
      });
      toast.push({ title: t.settings.generalSaved, variant: 'success' });
    } catch (e) {
      toast.push({ title: t.common.saveFailed, description: getErrorMessage(e), variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.settings.title}</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            {t.settings.subtitleDetailed}{' '}
            <a href="/fees" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              {t.settings.feesLink}
            </a>
            .
          </div>
        </div>
        <SlidersHorizontal size={28} className="muted" aria-hidden style={{ flexShrink: 0 }} />
      </div>

      <div className="card">
        <div className="cardBody" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <div className="field">
            <div className="label">{t.settings.currency}</div>
            <input
              className="input"
              list="admin-common-currencies"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder={t.settings.currencyPlaceholder}
              disabled={loading || saving}
              autoCapitalize="characters"
            />
            <datalist id="admin-common-currencies">
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t.settings.currencyHintDetailed}
            </div>
          </div>

          <div className="field">
            <div className="label">{t.settings.timezone}</div>
            <input
              className="input"
              list="admin-common-timezones"
              value={defaultTimezone}
              onChange={(e) => setDefaultTimezone(e.target.value)}
              placeholder={t.settings.timezonePlaceholder}
              disabled={loading || saving}
            />
            <datalist id="admin-common-timezones">
              {COMMON_TIMEZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t.settings.timezoneHintDetailed}
            </div>
          </div>

          <div className="field">
            <div className="label">{t.settings.serviceZones}</div>
            <textarea
              className="input"
              value={serviceZonesText}
              onChange={(e) => setServiceZonesText(e.target.value)}
              placeholder={t.settings.serviceZonesPlaceholderDetailed}
              rows={6}
              disabled={loading || saving}
              style={{ minHeight: 120, resize: 'vertical' }}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t.settings.serviceZonesHintDetailed}
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btnPrimary" onClick={() => void onSave()} disabled={loading || saving}>
              {saving ? t.common.saving : t.settings.saveButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
