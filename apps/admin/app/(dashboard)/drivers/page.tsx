'use client';

export default function DriversPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>Drivers</h1>
        <div className="muted" style={{ marginTop: 4 }}>Driver management and pending approvals.</div>
      </div>
      <div className="card">
        <div className="cardBody">
          <p className="muted">Placeholder — wire to admin drivers API when ready. Use Orders or Transactions in the nav.</p>
        </div>
      </div>
    </div>
  );
}
