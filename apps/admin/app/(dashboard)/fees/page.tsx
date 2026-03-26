'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getErrorMessage } from '@/lib/api/client';
import { getAppSettings, updateAppSettings } from '@/lib/api/appSettings.api';

export default function FeesAndTaxPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState<string>('0');
  const [taxPercent, setTaxPercent] = useState<string>('0');

  useEffect(() => {
    setLoading(true);
    getAppSettings()
      .then((res) => {
        setDeliveryFee(String(res.data?.deliveryFee ?? 0));
        setTaxPercent(String(res.data?.taxPercent ?? 0));
      })
      .catch((e) => toast.push({ title: 'Failed to load settings', description: getErrorMessage(e), variant: 'danger' }))
      .finally(() => setLoading(false));
  }, [toast]);

  const onSave = async () => {
    const df = Number(deliveryFee);
    const tp = Number(taxPercent);
    if (!Number.isFinite(df) || df < 0) {
      toast.push({ title: 'Delivery fee must be >= 0', variant: 'warning' });
      return;
    }
    if (!Number.isFinite(tp) || tp < 0 || tp > 100) {
      toast.push({ title: 'Tax % must be between 0 and 100', variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await updateAppSettings({ deliveryFee: df, taxPercent: tp });
      toast.push({ title: 'Saved', variant: 'success' });
    } catch (e) {
      toast.push({ title: 'Save failed', description: getErrorMessage(e), variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Fees & Tax</h1>
        <div className="muted" style={{ marginTop: 6 }}>
          Configure delivery fee and tax percentage for the customer cart totals.
        </div>
      </div>

      <div className="card">
        <div className="cardBody" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
          <div className="field">
            <div className="label">Delivery fee</div>
            <input
              className="input"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              disabled={loading || saving}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Flat amount added to cart grand total.</div>
          </div>

          <div className="field">
            <div className="label">Tax %</div>
            <input
              className="input"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              disabled={loading || saving}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Applied on subtotal (subtotal * tax% / 100).</div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btnPrimary" onClick={() => void onSave()} disabled={loading || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

