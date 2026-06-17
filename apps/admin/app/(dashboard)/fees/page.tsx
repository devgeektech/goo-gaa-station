'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getErrorMessage } from '@/lib/api/client';
import { getAppSettings, updateAppSettings } from '@/lib/api/appSettings.api';
import { useTranslations } from '@/lib/i18n/useTranslations';

export default function FeesPage() {
  const t = useTranslations();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState<string>('0');
  const [commissionPercent, setCommissionPercent] = useState<string>('2');

  useEffect(() => {
    setLoading(true);
    getAppSettings()
      .then((res) => {
        setDeliveryFee(String(res.data?.deliveryFee ?? 0));
        setCommissionPercent(String(res.data?.commissionPercent ?? 15));
      })
      .catch((e) => toast.push({ title: t.fees.loadFailed, description: getErrorMessage(e), variant: 'danger' }))
      .finally(() => setLoading(false));
  }, [toast, t.fees.loadFailed]);

  const onSave = async () => {
    const df = Number(deliveryFee);
    const cp = Number(commissionPercent);
    if (!Number.isFinite(df) || df < 0) {
      toast.push({ title: t.fees.validationDelivery, variant: 'warning' });
      return;
    }
    if (!Number.isFinite(cp) || cp < 0 || cp > 100) {
      toast.push({ title: t.fees.validationCommission, variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await updateAppSettings({ deliveryFee: df, commissionPercent: cp });
      toast.push({ title: t.common.saved, variant: 'success' });
    } catch (e) {
      toast.push({ title: t.common.saveFailed, description: getErrorMessage(e), variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{t.fees.title}</h1>
        <div className="muted" style={{ marginTop: 6 }}>
          {t.fees.subtitleDetailed}
        </div>
      </div>

      <div className="card">
        <div className="cardBody" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
          <div className="field">
            <div className="label">{t.fees.deliveryFee}</div>
            <input
              className="input"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              disabled={loading || saving}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t.fees.deliveryFeeCartHint}</div>
          </div>

          <div className="field">
            <div className="label">{t.fees.commission}</div>
            <input
              className="input"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              inputMode="decimal"
              placeholder="15"
              disabled={loading || saving}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t.fees.commissionDetailedHint}
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btnPrimary" onClick={() => void onSave()} disabled={loading || saving}>
              {saving ? t.common.saving : t.common.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
