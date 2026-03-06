export enum UserStatus {
  Active = 'active',
  Inactive = 'inactive',
  Suspended = 'suspended',
  Pending = 'pending',
}

export enum DriverStatus {
  Available = 'available',
  Busy = 'busy',
  Offline = 'offline',
  OnDelivery = 'on_delivery',
}

export enum ApprovalStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

export enum OrderStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Preparing = 'preparing',
  Ready = 'ready',
  PickedUp = 'picked_up',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
}

export enum PaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
  Refunded = 'refunded',
}

export enum UserRole {
  User = 'user',
  Driver = 'driver',
  Admin = 'admin',
  Restaurant = 'restaurant',
}

export enum VehicleType {
  Bike = 'bike',
  Scooter = 'scooter',
  Car = 'car',
}
