'use client';

import { FileText, Image as ImageIcon, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import type { DriverDetail } from '@/lib/api/drivers.api';
import { formatDateTime } from '@/lib/utils/format';

/** Uploads are served at `{origin}/uploads/...`, not under `/api/v1`. */
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

type KycField = 'driversLicense' | 'nationalId' | 'vehiclePhotos';

function kycRows(driver: DriverDetail): { key: KycField; label: string; urls: string[] }[] {
  const docs = driver.kycDocuments ?? {};
  const dl = docs.driversLicense ? [docs.driversLicense] : [];
  const nid = Array.isArray(docs.nationalId) ? docs.nationalId.filter(Boolean) as string[] : [];
  const veh = Array.isArray(docs.vehiclePhotos) ? docs.vehiclePhotos.filter(Boolean) as string[] : [];
  return [
    { key: 'driversLicense', label: "Driver's license", urls: dl },
    { key: 'nationalId', label: 'National ID', urls: nid },
    { key: 'vehiclePhotos', label: 'Vehicle photos', urls: veh },
  ];
}

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
  const kyc = driver.kycStatus ?? 'not_submitted';
  const showActions = kyc === 'pending';

  return (
    <div className="card">
      <div className="cardBody">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>KYC documents</h2>
          {showActions && onApprove && onReject ? (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btnPrimary" onClick={onApprove} disabled={approveLoading}>
                <CheckCircle size={16} aria-hidden /> {approveLoading ? '…' : 'Approve'}
              </button>
              <button type="button" className="btn btnDanger" onClick={onReject}>
                <XCircle size={16} aria-hidden /> Reject
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
            <div style={{ fontWeight: 700 }}>
              {kyc === 'approved' && 'KYC approved'}
              {kyc === 'rejected' && 'KYC rejected'}
              {kyc === 'not_submitted' && 'KYC not submitted'}
            </div>
            {driver.kycSubmittedAt ? (
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Submitted {formatDateTime(driver.kycSubmittedAt)}
              </div>
            ) : null}
            {kyc === 'rejected' && driver.kycRejectionReason ? (
              <div style={{ marginTop: 8, fontSize: 14 }}>{driver.kycRejectionReason}</div>
            ) : null}
          </div>
        ) : (
          driver.kycSubmittedAt ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Submitted {formatDateTime(driver.kycSubmittedAt)}
            </div>
          ) : null
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <tbody>
            {kycRows(driver).flatMap(({ key, label, urls }) =>
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
                              <ExternalLink size={14} style={{ marginRight: 6 }} aria-hidden /> View
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
                        <span className="muted">Not uploaded</span>
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
