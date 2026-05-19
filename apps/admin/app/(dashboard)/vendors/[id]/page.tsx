'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Store, FileText, Image as ImageIcon, ExternalLink, Download, CheckCircle, Circle } from 'lucide-react';
import { getVendor, listMenuItems, approveVendor, rejectVendor } from '@/lib/api/vendors.api';
import type { VendorDetail, MenuItem } from '@/lib/api/vendors.api';
import { MenuItemsTable } from '@/components/vendors/MenuItemsTable';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/utils/format';
import { useGetVendorProductsQuery } from '@/store/api';
import type { VendorProductItem } from '@/store/api';

function publicFileBase(): string {
  const base = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';
  return base.replace(/\/api\/v1\/?$/, '');
}
function imgSrc(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${publicFileBase()}${url}`;
}

const DAY_LABELS: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const ONBOARDING_STEP_LABELS = ['Phone Verified', 'Business Info', 'Address', 'KYC Documents', 'Submitted'] as const;

function getOnboardingBadge(vendor: VendorDetail): { label: string; style: React.CSSProperties } {
  const step = vendor.onboardingStep ?? 0;
  const status = vendor.approvalStatus ?? null;
  if (step >= 0 && step <= 5) return { label: 'Incomplete', style: { background: 'var(--warning-light)', color: 'var(--warning)' } };
  if (step === 6 && status === 'pending') return { label: 'Pending Review', style: { background: 'rgba(249, 115, 22, 0.15)', color: '#ea580c' } };
  if (status === 'approved') return { label: 'Approved', style: { background: 'var(--success-light)', color: 'var(--success)' } };
  if (status === 'rejected') return { label: 'Rejected', style: { background: 'var(--danger-light)', color: 'var(--danger)' } };
  return { label: 'Incomplete', style: { background: 'var(--warning-light)', color: 'var(--warning)' } };
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().endsWith('.pdf');
}

type StockTab = 'all' | 'in' | 'out';

function ProductsCard({ vendorId, imgBase }: { vendorId: string; imgBase: string }) {
  const [stockFilter, setStockFilter] = useState<StockTab>('all');
  const [pagesRequested, setPagesRequested] = useState(1);
  const limit = 20;

  const q1 = useGetVendorProductsQuery({ vendorId, page: 1, limit });
  const q2 = useGetVendorProductsQuery({ vendorId, page: 2, limit }, { skip: pagesRequested < 2 });
  const q3 = useGetVendorProductsQuery({ vendorId, page: 3, limit }, { skip: pagesRequested < 3 });
  const q4 = useGetVendorProductsQuery({ vendorId, page: 4, limit }, { skip: pagesRequested < 4 });
  const q5 = useGetVendorProductsQuery({ vendorId, page: 5, limit }, { skip: pagesRequested < 5 });

  const allData = useMemo(() => {
    const pages = [q1.data, q2.data, q3.data, q4.data, q5.data].filter(Boolean) as { data: VendorProductItem[]; total: number; page: number; hasNext?: boolean }[];
    const merged = pages.flatMap((p) => p.data);
    const total = pages[0]?.total ?? 0;
    const hasNext = pages.length > 0 && (pages[pages.length - 1]?.hasNext ?? false);
    return { merged, total, hasNext };
  }, [q1.data, q2.data, q3.data, q4.data, q5.data]);

  const filtered = useMemo(() => {
    if (stockFilter === 'all') return allData.merged;
    if (stockFilter === 'in') return allData.merged.filter((p) => p.isAvailable);
    return allData.merged.filter((p) => !p.isAvailable);
  }, [allData.merged, stockFilter]);

  const loading = q1.isLoading;
  const totalCount = allData.total;

  return (
    <div className="card">
      <div className="cardBody">
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700 }}>Products ({totalCount})</h2>
        <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['all', 'in', 'out'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className="btn"
              style={{
                background: stockFilter === tab ? 'var(--primary)' : 'var(--panel)',
                color: stockFilter === tab ? '#fff' : 'var(--text)',
              }}
              onClick={() => setStockFilter(tab)}
            >
              {tab === 'all' ? 'All' : tab === 'in' ? 'In Stock' : 'Out of Stock'}
            </button>
          ))}
        </div>
        {loading && filtered.length === 0 ? (
          <div className="muted">Loading products…</div>
        ) : filtered.length === 0 ? (
          <div className="muted">No products</div>
        ) : (
          <>
            <div className="adminVendorProductsScroll">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Product</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Category</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Price</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 0', verticalAlign: 'middle' }}>
                      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                        {p.image ? (
                          <img
                            src={imgBase && !p.image.startsWith('http') ? `${imgBase}${p.image}` : p.image}
                            alt=""
                            style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', background: 'var(--border-light)' }}
                          />
                        ) : (
                          <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 20 }}>📷</div>
                        )}
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 0', verticalAlign: 'middle', color: 'var(--text-secondary)' }}>
                      {typeof p.category === 'object' && p.category?.name ? p.category.name : '—'}
                    </td>
                    <td style={{ padding: '10px 0', verticalAlign: 'middle' }}>${Number(p.price).toFixed(2)}</td>
                    <td style={{ padding: '10px 0', verticalAlign: 'middle' }}>
                      <span
                        className="badge"
                        style={{
                          background: p.isAvailable ? 'var(--success-light)' : 'var(--danger-light)',
                          color: p.isAvailable ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        {p.isAvailable ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 0', verticalAlign: 'middle', color: 'var(--text-secondary)', fontSize: 13 }}>
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {allData.hasNext && (
              <button
                type="button"
                className="btn"
                style={{ marginTop: 16 }}
                onClick={() => setPagesRequested((p) => Math.min(p + 1, 5))}
                disabled={pagesRequested >= 5 || q2.isLoading || q3.isLoading || q4.isLoading || q5.isLoading}
              >
                {q2.isLoading || q3.isLoading || q4.isLoading || q5.isLoading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function VendorDetailPage() {
  const params = useParams();
  const toast = useToast();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadVendor = () => {
    if (!id) return;
    setLoading(true);
    getVendor(id)
      .then((res) => {
        const data = res.data;
        setVendor(data);
        setMenuItems(data?.menuItems ?? []);
      })
      .catch(() => setVendor(null))
      .finally(() => setLoading(false));
  };

  const loadMenuItems = () => {
    if (!id) return;
    setMenuLoading(true);
    listMenuItems(id)
      .then((res) => setMenuItems(res.data ?? []))
      .catch(() => setMenuItems([]))
      .finally(() => setMenuLoading(false));
  };

  useEffect(() => {
    if (id) loadVendor();
  }, [id]);

  useEffect(() => {
    if (vendor && (vendor.menuItems == null || vendor.menuItems.length === 0)) loadMenuItems();
  }, [vendor?._id]);

  if (!id) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="muted">Invalid vendor ID.</div>
      </div>
    );
  }

  if (loading && !vendor) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Skeleton height={40} />
        <Skeleton height={320} />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="muted">Vendor not found.</div>
      </div>
    );
  }

  const items = menuItems.length > 0 ? menuItems : (vendor.menuItems ?? []);
  const onboardingBadge = getOnboardingBadge(vendor);
  const step = vendor.onboardingStep ?? 0;
  const approvalStatus = vendor.approvalStatus ?? null;
  const canApproveReject = approvalStatus === 'pending' && step === 6;
  const reviewerName = vendor.reviewedBy && typeof vendor.reviewedBy === 'object' && 'name' in vendor.reviewedBy
    ? (vendor.reviewedBy as { name?: string }).name
    : null;

  const handleApprove = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await approveVendor(id);
      toast.push({ title: 'Vendor approved', variant: 'success' });
      loadVendor();
    } catch (e: unknown) {
      toast.push({ title: 'Approve failed', description: e instanceof Error ? e.message : 'Error', variant: 'danger' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async () => {
    const trimmed = rejectReason.trim();
    if (trimmed.length < 10) {
      toast.push({ title: 'Reason must be at least 10 characters', variant: 'danger' });
      return;
    }
    if (!id) return;
    setActionLoading(true);
    try {
      await rejectVendor(id, trimmed);
      toast.push({ title: 'Vendor rejected', variant: 'success' });
      setRejectModalOpen(false);
      setRejectReason('');
      loadVendor();
    } catch (e: unknown) {
      toast.push({ title: 'Reject failed', description: e instanceof Error ? e.message : 'Error', variant: 'danger' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <Link href="/vendors" className="btn" aria-label="Back to vendors">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>Vendor detail</h1>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {imgSrc(vendor.logo) ? (
              <img src={imgSrc(vendor.logo)!} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <Store size={32} />
              </div>
            )}
            <div>
              <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 20 }}>{vendor.name}</span>
                <span className="badge" style={onboardingBadge.style}>{onboardingBadge.label}</span>
              </div>
              <div className="muted">{vendor.slug}</div>
              {vendor.description ? <div className="muted" style={{ marginTop: 4 }}>{vendor.description}</div> : null}
              {vendor.email ? <div className="muted">{vendor.email}</div> : null}
              {vendor.phone ? <div className="muted">{vendor.phone}</div> : null}
              <span className="badge" style={{ marginTop: 8, background: vendor.status === 'blocked' ? 'var(--danger-light)' : 'var(--success-light)' }}>{vendor.status}</span>
              <div style={{ marginTop: 12, fontSize: 15 }}>
                <span className="muted">Revenue </span>
                <span style={{ fontWeight: 800 }}>{formatMoney(vendor.revenue ?? 0)}</span>
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  (delivered · order − driver fee − commission)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 1 — Onboarding Progress */}
      <div className="card">
        <div className="cardBody">
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700 }}>Onboarding Progress</h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {ONBOARDING_STEP_LABELS.map((label, i) => {
              const stepNum = i + 1;
              const done = step >= stepNum;
              return (
                <div key={label} className="row" style={{ alignItems: 'center', gap: 4 }}>
                  {done ? (
                    <CheckCircle size={20} style={{ color: 'var(--success)', flexShrink: 0 }} aria-hidden />
                  ) : (
                    <Circle size={20} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden />
                  )}
                  <span style={{ fontSize: 14, color: done ? 'var(--text)' : 'var(--text-secondary)' }}>{label}</span>
                  {i < ONBOARDING_STEP_LABELS.length - 1 && (
                    <span style={{ marginLeft: 4, color: 'var(--border)', fontSize: 12 }}>•</span>
                  )}
                </div>
              );
            })}
          </div>
          {vendor.submittedAt && (
            <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              Submitted: {new Date(vendor.submittedAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* CARD 2 — KYC Documents */}
      <div className="card">
        <div className="cardBody">
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700 }}>KYC Documents</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                { key: 'businessRegistration' as const, label: 'Business Registration', urls: vendor.kycDocuments?.businessRegistration ? [vendor.kycDocuments.businessRegistration] : [] },
                { key: 'identityDocument' as const, label: 'Identity Document', urls: (() => {
                  const id = vendor.kycDocuments?.identityDocument;
                  if (Array.isArray(id)) return id.filter(Boolean) as string[];
                  return id ? [id] : [];
                })() },
                { key: 'healthSafetyLicense' as const, label: 'Health & Safety License', urls: vendor.kycDocuments?.healthSafetyLicense ? [vendor.kycDocuments.healthSafetyLicense] : [] },
              ].flatMap(({ key, label, urls }) =>
                urls.length > 0
                  ? urls.map((url, i) => {
                      const fullUrl = imgSrc(url);
                      return (
                        <tr key={`${key}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 0', verticalAlign: 'middle' }}>{urls.length > 1 ? `${label} (${i + 1})` : label}</td>
                          <td style={{ padding: '12px 0', verticalAlign: 'middle' }}>
                            <span className="row" style={{ alignItems: 'center', gap: 8 }}>
                              {isPdfUrl(url) ? <FileText size={18} style={{ color: 'var(--text-secondary)' }} aria-hidden /> : <ImageIcon size={18} style={{ color: 'var(--text-secondary)' }} aria-hidden />}
                              <a href={fullUrl!} target="_blank" rel="noopener noreferrer" className="btn" style={{ padding: '6px 10px', fontSize: 13 }}>
                                <ExternalLink size={14} style={{ marginRight: 6 }} aria-hidden /> View
                              </a>
                              <a href={fullUrl!} download className="btn" style={{ padding: '6px 10px', fontSize: 13 }}>
                                <Download size={14} style={{ marginRight: 6 }} aria-hidden /> Download
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

      {/* Operating Hours */}
      <div className="card">
        <div className="cardBody">
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700 }}>Operating Hours</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Day</th>
                <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {DAY_ORDER.map((day) => {
                const entry = vendor.operatingHours?.find((h) => h.day === day);
                const isOpen = entry?.isOpen ?? false;
                const range = isOpen && entry?.from && entry?.to ? `${entry.from} - ${entry.to}` : '—';
                return (
                  <tr key={day} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 0' }}>{DAY_LABELS[day] ?? day}</td>
                    <td style={{ padding: '10px 0' }}>
                      <span className="badge" style={{ background: isOpen ? 'var(--success-light)' : 'var(--border-light)', color: isOpen ? 'var(--success)' : 'var(--text-secondary)' }}>
                        {isOpen ? 'Open' : 'Closed'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 0', color: 'var(--text-secondary)' }}>{range}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CARD 4 — Contact Person */}
      <div className="card">
        <div className="cardBody">
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700 }}>Contact Person</h2>
          {vendor.contactPerson?.name || vendor.contactPerson?.email ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vendor.contactPerson?.name && <div><span className="muted">Name: </span>{vendor.contactPerson.name}</div>}
              {vendor.contactPerson?.email && <div><span className="muted">Email: </span><a href={`mailto:${vendor.contactPerson.email}`}>{vendor.contactPerson.email}</a></div>}
            </div>
          ) : (
            <span className="muted">Not provided</span>
          )}
        </div>
      </div>

      {/* CARD 5 — Approval Action Panel / read-only status */}
      {canApproveReject && (
        <div className="card">
          <div className="cardBody">
            <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700 }}>Approval Action</h2>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btnPrimary"
                onClick={handleApprove}
                disabled={actionLoading}
                style={{ background: 'var(--success)' }}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setRejectModalOpen(true)}
                disabled={actionLoading}
                style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {(approvalStatus === 'approved' || approvalStatus === 'rejected') && (
        <div
          className="card"
          style={{
            borderLeft: `4px solid ${approvalStatus === 'approved' ? 'var(--success)' : 'var(--danger)'}`,
          }}
        >
          <div className="cardBody">
            <h2 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700 }}>
              {approvalStatus === 'approved' ? 'Approved' : 'Rejected'}
            </h2>
            {approvalStatus === 'approved' && vendor.approvedAt && (
              <div className="muted" style={{ fontSize: 14 }}>Approved at {new Date(vendor.approvedAt).toLocaleString()}</div>
            )}
            {approvalStatus === 'rejected' && vendor.rejectedAt && (
              <div className="muted" style={{ fontSize: 14 }}>Rejected at {new Date(vendor.rejectedAt).toLocaleString()}</div>
            )}
            {approvalStatus === 'rejected' && vendor.rejectionReason && (
              <div style={{ marginTop: 8, padding: 12, background: 'var(--panel)', borderRadius: 8 }}>{vendor.rejectionReason}</div>
            )}
            {reviewerName && (
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>Reviewed by {reviewerName}</div>
            )}
          </div>
        </div>
      )}

      <ProductsCard vendorId={id} imgBase={publicFileBase()} />

      {/* Reject modal */}
      {rejectModalOpen && (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setRejectModalOpen(false); }}
        >
          <div className="card" style={{ maxWidth: 440 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="cardBody">
              <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Reject vendor</h2>
              <p className="muted" style={{ marginBottom: 12 }}>Provide a reason (min 10 characters). The vendor will be notified.</p>
              <textarea
                className="textarea"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                rows={4}
                style={{ width: '100%', marginBottom: 16 }}
              />
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => { setRejectModalOpen(false); setRejectReason(''); }}>Cancel</button>
                <button
                  type="button"
                  className="btn"
                  style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
                  onClick={handleRejectSubmit}
                  disabled={actionLoading || rejectReason.trim().length < 10}
                >
                  {actionLoading ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="cardBody">
            <div className="muted">Rating</div>
            <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>—</div>
          </div>
        </div>
        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="cardBody">
            <div className="muted">Orders</div>
            <div style={{ marginTop: 8, fontWeight: 800, fontSize: 24 }}>—</div>
          </div>
        </div>
      </div>

      <MenuItemsTable
        vendorId={id}
        items={items}
        loading={menuLoading && items.length === 0}
        onRefresh={() => { loadMenuItems(); }}
        onEdit={(item) => { /* optional: open edit modal */ }}
      />
    </div>
  );
}
