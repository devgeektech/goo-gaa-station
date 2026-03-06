import type {
  UserStatus,
  DriverStatus,
  ApprovalStatus,
  OrderStatus,
  PaymentStatus,
  UserRole,
  VehicleType,
} from './enums';

export interface IAddress {
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  coordinates?: { lat: number; lng: number };
}

export interface IUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  name?: string;
  phone?: string;
  address?: IAddress;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDriver {
  id: string;
  userId: string;
  status: DriverStatus;
  approvalStatus: ApprovalStatus;
  vehicleType: VehicleType;
  licenseNumber?: string;
  rating?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICartItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
  options?: Record<string, unknown>;
}

export interface IRestaurant {
  id: string;
  name: string;
  slug?: string;
  address?: IAddress;
  isActive?: boolean;
}

export interface IOrder {
  id: string;
  userId: string;
  driverId?: string;
  restaurantId?: string;
  status: OrderStatus;
  items: ICartItem[];
  totalAmount: number;
  paymentStatus: PaymentStatus;
  deliveryAddress: IAddress;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITransaction {
  id: string;
  orderId: string;
  amount: number;
  status: PaymentStatus;
  provider?: string;
  externalId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdmin {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotification {
  id: string;
  userId: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: Date;
}
