# Phase 11 Socket.IO Event Summary

## Rooms

- `vendor:{vendorId}` - Vendor app joins on login.
- `customer:{customerId}` - Customer app joins on login.
- `driver:{driverId}` - Driver app joins on login.
- `admin` - Admin panel joins on login.

## Event Register

| Event | Emitter | Receiver | Trigger |
|---|---|---|---|
| `order:new` | Server | `vendor:{id}` | Customer places order |
| `order:accepted` | Server | `customer:{id}` | Vendor accepts order |
| `order:rejected` | Server | `customer:{id}` | Vendor rejects order |
| `order:timeout` | Server | `customer:{id}` | Vendor response window expires |
| `order:cancelled` | Server | `customer:{id}` | Any cancellation with customer-facing cancel update |
| `order:driver_request` | Server | `driver:{id}` | After vendor accepts (nearby driver discovery) |
| `order:driver_assigned` | Server | `vendor:{id}`, `admin` | Driver accepted assignment |
| `order:taken` | Server | Other `driver:{id}` rooms | Another driver already accepted assignment |
| `order:preparing` | Server | `customer:{id}` | Driver accepted assignment and order moved to preparing |
| `order:ready_for_pickup` | Server | `driver:{id}` | Vendor marks order as ready |
| `order:status_updated` | Server | `customer:{id}` | Generic customer status updates |
| `order:picked_up` | Server | `customer:{id}` | Driver picked up order |
| `order:on_the_way` | Server | `customer:{id}` | Driver started route to customer |
| `order:delivered` | Server | `customer:{id}`, `vendor:{id}`, `admin` | OTP verified and order delivered |

## Figma Status Badge Mapping

| Order status | Vendor tab | Figma badge color | Badge label |
|---|---|---|---|
| `vendor_notified` | New | Red | NEW |
| `accepted` | Current | Orange | PREPARING (before driver joins) |
| `preparing` | Current | Orange | PREPARING |
| `ready` | Current | Blue | READY FOR PICKUP |
| `picked_up` | Current | Blue | OUT FOR DELIVERY |
| `on_the_way` | Current | Blue | OUT FOR DELIVERY |
| `delivered` | Completed | Green | DELIVERED |
| `cancelled` | Completed | Grey | CANCELLED |

