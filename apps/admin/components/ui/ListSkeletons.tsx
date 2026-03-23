'use client';

import { Skeleton } from './Skeleton';

/** 5 rows, column widths for user list (name, phone, email, status, actions). */
export function UserListSkeleton() {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: '22%' }}>Name</th>
            <th style={{ width: '18%' }}>Phone</th>
            <th style={{ width: '22%' }}>Email</th>
            <th style={{ width: '12%' }}>Status</th>
            <th style={{ width: '26%' }} />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td><Skeleton height={18} width="80%" /></td>
              <td><Skeleton height={18} width="70%" /></td>
              <td><Skeleton height={18} width="75%" /></td>
              <td><Skeleton height={20} width={64} /></td>
              <td><Skeleton height={18} width={80} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 5 rows for driver list. */
export function DriverListSkeleton() {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Approval</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td><Skeleton height={18} width="60%" /></td>
              <td><Skeleton height={18} width="50%" /></td>
              <td><Skeleton height={20} width={56} /></td>
              <td><Skeleton height={20} width={72} /></td>
              <td><Skeleton height={18} width={60} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 5 rows for order list (Order#, Customer, Driver, Items, Total, Payment, Status, Date, Eye). */
export function OrderListSkeleton() {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Order#</th>
            <th>Customer</th>
            <th>Driver</th>
            <th>Items</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td><Skeleton height={18} width={100} /></td>
              <td><Skeleton height={18} width="70%" /></td>
              <td><Skeleton height={18} width="50%" /></td>
              <td><Skeleton height={18} width={32} /></td>
              <td><Skeleton height={18} width={56} /></td>
              <td><Skeleton height={20} width={52} /></td>
              <td><Skeleton height={20} width={72} /></td>
              <td><Skeleton height={18} width={90} /></td>
              <td><Skeleton height={18} width={28} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 5 rows for transaction list. */
export function TransactionListSkeleton() {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Txn ID</th>
            <th>Order#</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Type</th>
            <th>Status</th>
            <th>Ref</th>
            <th>Date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td><Skeleton height={18} width={80} /></td>
              <td><Skeleton height={18} width={90} /></td>
              <td><Skeleton height={18} width="50%" /></td>
              <td><Skeleton height={18} width={56} /></td>
              <td><Skeleton height={20} width={58} /></td>
              <td><Skeleton height={20} width={56} /></td>
              <td><Skeleton height={18} width={100} /></td>
              <td><Skeleton height={18} width={90} /></td>
              <td><Skeleton height={18} width={28} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 4 KPI cards in a row. */
export function KPICardSkeleton() {
  return (
    <div className="grid3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card">
          <div className="cardBody">
            <div className="muted"><Skeleton height={14} width={80} /></div>
            <div style={{ marginTop: 8 }}><Skeleton height={28} width={90} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chart area placeholder. */
export function ChartSkeleton() {
  return <Skeleton height={260} width="100%" />;
}

/** Generic table skeleton (5 rows, 4 cols). */
export function TableSkeleton() {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th><Skeleton height={16} width="25%" /></th>
            <th><Skeleton height={16} width="25%" /></th>
            <th><Skeleton height={16} width="25%" /></th>
            <th><Skeleton height={16} width="25%" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td><Skeleton height={18} /></td>
              <td><Skeleton height={18} /></td>
              <td><Skeleton height={18} /></td>
              <td><Skeleton height={18} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
