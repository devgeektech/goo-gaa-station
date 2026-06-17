'use client';

import { FileText, Image as ImageIcon, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import type { DriverDetail } from '@/lib/api/drivers.api';
import { formatDateTime } from '@/lib/utils/format';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatT } from '@/lib/i18n/translations';

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}

function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().endsWith('.pdf');
}

type KycField = 'driversLicense' | 'nationalId' | 'vehiclePhotos' | 'selfieImage';

export function DriverKycCard({
  driver,
  onApprove,
  onReject,
  approveLoading,
}: {
  driver: DriverDetail;
  onApprove?: () => void;
  onReject?: () => void;
  approveLoading?: boolean;
}) {
  const t = useTranslations();
  const kyc = driver.kycStatus ?? 'not_submitted';
  const showActions = kyc === 'pending';

  const kycRows: { key: KycField; label: string; urls: string[] }[] = (() => {
    const docs = driver.kycDocuments ?? {};
    const dl = docs.driversLicense ? [docs.driversLicense] : [];
    const nid = Array.isArray(docs.nationalId) ? docs.nationalId.filter(Boolean) as string[] : [];
    const veh = Array.isArray(docs.vehiclePhotos) ? docs.vehiclePhotos.filter(Boolean) as string[] : [];
    const selfie = docs.selfieImage ? [docs.selfieImage] : [];
    return [
      { key: 'driversLicense', label: t.drivers.driversLicense, urls: dl },
      { key: 'nationalId', label: t.drivers.nationalId, urls: nid },
      { key: 'vehiclePhotos', label: t.drivers.vehiclePhotos, urls: veh },
      { key: 'selfieImage', label: t.drivers.selfieImage, urls: selfie },
    ];
  })();

  const kycStatusLabel =
    kyc === 'approved'
      ? t.status.kyc.approved
      : kyc === 'rejected'
        ? t.status.kyc.rejected
        : kyc === 'not_submitted'
          ? t.status.kyc.notSubmitted
          : t.status.kyc.uploaded;

  return (
    <div className="card">
      <div className="cardBody">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t.drivers.kycDocuments}</h2>
          {showActions && onApprove && onReject ? (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btnPrimary" onClick={onApprove} disabled={approveLoading}>
                <CheckCircle size={16} aria-hidden /> {approveLoading ? '…' : t.drivers.approve}
              </button>
              <button type="button" className="btn btnDanger" onClick={onReject}>
                <XCircle size={16} aria-hidden /> {t.drivers.reject}
              </button>
            </div>
          ) : null}
        </div>

        {!showActions ? (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background:
                kyc === 'approved'
                  ? 'var(--success-light)'
                  : kyc === 'rejected'
                    ? 'var(--danger-light)'
                    : 'var(--border-light)',
            }}
          >
            <div style={{ fontWeight: 700 }}>{kycStatusLabel}</div>
            {driver.kycSubmittedAt ? (
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {formatT(t.common.submitted, { date: formatDateTime(driver.kycSubmittedAt) })}
              </div>
            ) : null}
            {kyc === 'rejected' && driver.kycRejectionReason ? (
              <div style={{ marginTop: 8, fontSize: 14 }}>{driver.kycRejectionReason}</div>
            ) : null}
          </div>
        ) : (
          driver.kycSubmittedAt ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {formatT(t.common.submitted, { date: formatDateTime(driver.kycSubmittedAt) })}
            </div>
          ) : null
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <tbody>
            {kycRows.flatMap(({ key, label, urls }) =>
              urls.length > 0
                ? urls.map((url, i) => {
                    const fullUrl = imgSrc(url);
                    return (
                      <tr key={`${key}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 0', verticalAlign: 'middle' }}>
                          {urls.length > 1 ? `${label} (${i + 1})` : label}
                        </td>
                        <td style={{ padding: '12px 0', verticalAlign: 'middle' }}>
                          <span className="row" style={{ alignItems: 'center', gap: 8 }}>
                            {isPdfUrl(url) ? (
                              <FileText size={18} style={{ color: 'var(--text-secondary)' }} aria-hidden />
                            ) : (
                              <ImageIcon size={18} style={{ color: 'var(--text-secondary)' }} aria-hidden />
                            )}
                            <a href={fullUrl!} target="_blank" rel="noopener noreferrer" className="btn" style={{ padding: '6px 10px', fontSize: 13 }}>
                              <ExternalLink size={14} style={{ marginRight: 6 }} aria-hidden /> {t.common.viewImage}
                            </a>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                : [
                    <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 0', verticalAlign: 'middle' }}>{label}</td>
                      <td style={{ padding: '12px 0', verticalAlign: 'middle' }}>
                        <span className="muted">{t.common.notUploaded}</span>
                      </td>
                    </tr>,
                  ]
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
