import type { Request, Response } from 'express';
import { ROUTES } from './routes/docs';

/** Convert Express path to OpenAPI path (e.g. :id -> {id}) */
function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:(\w+)/g, '{$1}');
}

/** Path param name -> OpenAPI param spec (in: path, required) */
const PATH_PARAM_SCHEMAS: Record<string, { schema: { type: string; format?: string }; description: string }> = {
  id: { schema: { type: 'string' }, description: 'Resource ID (MongoDB ObjectId)' },
  // For customer addresses we use :index in the path, but clients may send either a numeric index or an address _id.
  // Use string here so Swagger does not force integer-only values.
  index: { schema: { type: 'string' }, description: 'Address index (0-based) or address id' },
  itemId: { schema: { type: 'string' }, description: 'Menu item ID' },
  reference: { schema: { type: 'string' }, description: 'Payment reference' },
  slug: { schema: { type: 'string' }, description: 'Category slug (e.g. burgers, pizza)' },
};

/** Extract path parameters from Express path and return OpenAPI parameters array */
function getParametersForPath(expressPath: string): Record<string, unknown>[] {
  const matches = expressPath.matchAll(/:(\w+)/g);
  const params: Record<string, unknown>[] = [];
  for (const m of matches) {
    const name = m[1];
    const spec = PATH_PARAM_SCHEMAS[name] ?? { schema: { type: 'string' }, description: name };
    params.push({
      name,
      in: 'path',
      required: true,
      schema: spec.schema,
      description: spec.description,
    });
  }
  return params;
}

/** Return query parameters for Swagger UI by "METHOD path" key. */
function getQueryParametersForRoute(opKey: string): Record<string, unknown>[] {
  const query = (
    name: string,
    schema: Record<string, unknown>,
    required = false,
    description?: string
  ): Record<string, unknown> => ({
    name,
    in: 'query',
    required,
    schema,
    description,
  });
  const categoryTypeSchema = { type: 'string', enum: ['food', 'grocery', 'pharmacy', 'fashion', 'retail'], example: 'food' };
  const paginationParams = [
    query('page', { type: 'integer', minimum: 1, default: 1, example: 1 }, false, 'Page number'),
    query('limit', { type: 'integer', minimum: 1, maximum: 100, default: 20, example: 20 }, false, 'Items per page'),
  ];
  const discoveryPaginationParams = [
    query('page', { type: 'integer', minimum: 1, default: 1, example: 1 }, false, 'Page number'),
    query('limit', { type: 'integer', minimum: 1, maximum: 100, default: 10, example: 10 }, false, 'Items per page (default 10)'),
  ];
  const discoveryFilterParams = [
    query('minRating', { type: 'number', example: 4 }, false, 'Minimum vendor rating (1–5)'),
    query('maxDeliveryTime', { type: 'integer', example: 45 }, false, 'Max delivery time in minutes'),
    query('minPrice', { type: 'number', example: 5 }, false, 'Minimum order amount'),
    query('maxPrice', { type: 'number', example: 50 }, false, 'Maximum order amount'),
  ];
  const map: Record<string, Record<string, unknown>[]> = {
    'GET /api/v1/admin/categories': [
      query('type', categoryTypeSchema, false, 'Filter by category type'),
      query('isActive', { type: 'string', enum: ['true', 'false'], example: 'true' }, false, 'Filter by active status'),
    ],
    'GET /api/v1/admin/vendors': [
      query('approvalStatus', { type: 'string', enum: ['none', 'pending', 'approved', 'rejected'] }, false, 'Filter by approval status'),
      query('search', { type: 'string', example: 'pizza' }, false, 'Search name, slug, description, email, phone'),
      query('status', { type: 'string', enum: ['active', 'blocked'] }, false, 'Filter by status'),
      ...paginationParams,
    ],
    'GET /api/v1/app/categories': [
      query('type', { ...categoryTypeSchema, description: 'Filter by category type (optional)' }, false, 'Filter by category type'),
    ],
    'GET /api/v1/app/categories/:slug/vendors': [
      query('sort', { type: 'string', enum: ['recommended', 'rating', 'deliveryTime'], default: 'recommended', example: 'recommended' }, false, 'Sort: recommended (newest), rating, deliveryTime'),
      ...discoveryFilterParams,
      ...discoveryPaginationParams,
    ],
    'GET /api/v1/app/vendors': [
      query('search', { type: 'string', example: 'pizza' }, false, 'Search vendor name (case-insensitive)'),
      query('category', { type: 'string', example: '507f1f77bcf86cd799439011' }, false, 'Category ObjectId to filter vendors'),
      query('sort', { type: 'string', enum: ['recommended', 'rating', 'deliveryTime'], default: 'recommended', example: 'recommended' }, false, 'Sort: recommended, rating, deliveryTime'),
      query('customerLat', { type: 'number', example: 30.6798 }, false, 'Customer latitude (WGS84); with customerLng enables ETA/distance without auth'),
      query('customerLng', { type: 'number', example: 76.7297 }, false, 'Customer longitude (WGS84)'),
      ...discoveryFilterParams,
      ...discoveryPaginationParams,
    ],
    'GET /api/v1/app/orders': [
      query(
        'status',
        { type: 'string', enum: ['active', 'completed', 'delivered', 'cancelled'], example: 'active' },
        false,
        'Filter: active (in-progress), completed (delivered+cancelled), delivered, cancelled. Omit for all.'
      ),
      ...paginationParams,
    ],
    'GET /api/v1/admin/vendors/:id/products': [
      query('category', { type: 'string' }, false, 'Category ObjectId filter'),
      query('isAvailable', { type: 'string', enum: ['true', 'false'] }, false, 'Filter by stock'),
      ...paginationParams,
    ],
    'GET /api/v1/vendor/products': [
      query('category', { type: 'string' }, false, 'Category ObjectId filter'),
      query('isAvailable', { type: 'string', enum: ['true', 'false'] }, false, 'Filter by stock'),
      ...paginationParams,
    ],
    'GET /api/v1/vendor/orders': [
      query('status', { type: 'string', enum: ['pending', 'vendor_notified', 'accepted', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered', 'cancelled'] }, false, 'Filter by order status'),
      ...paginationParams,
    ],
    'GET /api/v1/vendor/orders/new': [...paginationParams],
    'GET /api/v1/vendor/orders/current': [...paginationParams],
    'GET /api/v1/vendor/orders/completed': [...paginationParams],
    'GET /api/v1/vendor/test/nearby-drivers': [
      query('radiusKm', { type: 'number', minimum: 1, maximum: 50, default: 5, example: 5 }, false, 'Search radius in km (same as driver assignment)'),
    ],
    'GET /api/v1/driver/orders/new': [...paginationParams],
    'GET /api/v1/driver/orders/completed': [...paginationParams],
    'GET /api/v1/driver/orders/history': [...paginationParams],
    'GET /api/v1/driver/notifications': [
      ...paginationParams,
      query('unreadOnly', { type: 'string', enum: ['true', 'false'] }, false, 'If true, only unread notifications (read=false)'),
    ],
    'GET /api/v1/app/driver/orders/new': [...paginationParams],
    'GET /api/v1/app/driver/orders/completed': [...paginationParams],
    'GET /api/v1/app/driver/orders/history': [...paginationParams],
    'GET /api/v1/admin/orders': [
      query('status', { type: 'string', enum: ['pending', 'vendor_notified', 'accepted', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered', 'cancelled'] }, false, 'Filter by status'),
      query('vendorId', { type: 'string' }, false, 'Filter by vendor ObjectId'),
      query('customerId', { type: 'string' }, false, 'Filter by customer ObjectId'),
      query('driverId', { type: 'string' }, false, 'Filter by driver ObjectId'),
      query('dateFrom', { type: 'string', format: 'date-time' }, false, 'Orders from date (ISO)'),
      query('dateTo', { type: 'string', format: 'date-time' }, false, 'Orders to date (ISO)'),
      query('search', { type: 'string' }, false, 'Search order id or customer/vendor name'),
      ...paginationParams,
    ],
  };
  return map[opKey] ?? [];
}

/** Return response content with example for Swagger UI by "METHOD path" key (optional). */
function getResponseExampleForRoute(opKey: string): Record<string, unknown> | undefined {
  const categoryItem = { _id: '507f1f77bcf86cd799439011', name: 'Burgers', slug: 'burgers', icon: '/uploads/categories/icon.png', sortOrder: 0 };
  const vendorItem = {
    _id: '507f1f77bcf86cd799439012',
    name: 'Pizza House',
    slug: 'pizza-house',
    description: 'Best pizza in town',
    logo: '/uploads/logo.png',
    coverImage: '/uploads/cover.jpg',
    address: { street: 'Main St 1', city: 'Berlin', country: 'Germany' },
    categoryIds: [{ _id: '507f1f77bcf86cd799439011', name: 'Burgers', slug: 'burgers', icon: '/icon.png' }],
    sortOrder: 0,
  };
  const productItem = {
    _id: '507f1f77bcf86cd799439013',
    name: 'Margherita',
    description: 'Tomato and mozzarella',
    price: 12.99,
    image: '/uploads/product.png',
    category: { _id: '507f1f77bcf86cd799439011', name: 'Pizza' },
    isAvailable: true,
    sortOrder: 0,
  };
  const map: Record<string, Record<string, unknown>> = {
    'GET /api/v1/app/categories': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    categories: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          _id: { type: 'string' },
                          name: { type: 'string' },
                          slug: { type: 'string' },
                          icon: { type: 'string', nullable: true },
                          sortOrder: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          example: { success: true, data: [{ type: 'food', categories: [categoryItem] }] },
        },
      },
    },
    'GET /api/v1/app/categories/:slug/vendors': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  vendors: { type: 'array', items: { type: 'object' } },
                  total: { type: 'integer', example: 25 },
                  page: { type: 'integer', example: 1 },
                  pages: { type: 'integer', example: 3 },
                },
              },
            },
          },
          example: { success: true, data: { vendors: [vendorItem], total: 25, page: 1, pages: 3 } },
        },
      },
    },
    'GET /api/v1/app/vendors': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  vendors: { type: 'array', items: { type: 'object' } },
                  total: { type: 'integer', example: 42 },
                  page: { type: 'integer', example: 1 },
                  pages: { type: 'integer', example: 5 },
                },
              },
            },
          },
          example: { success: true, data: { vendors: [vendorItem], total: 42, page: 1, pages: 5 } },
        },
      },
    },
    'GET /api/v1/app/vendors/:id': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  vendor: { type: 'object' },
                  products: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
          example: { success: true, data: { vendor: vendorItem, products: [productItem] } },
        },
      },
    },
    'GET /api/v1/app/products/:id': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', description: 'Product with category, vendor info' },
            },
          },
          example: { success: true, data: productItem },
        },
      },
    },
    'GET /api/v1/app/cart': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  vendorId: { type: 'string' },
                  vendor: { type: 'object' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        productId: { type: 'string' },
                        product: { type: 'object' },
                        qty: { type: 'integer' },
                        price: { type: 'number' },
                      },
                    },
                  },
                  subtotal: { type: 'number' },
                  deliveryFee: { type: 'number' },
                  taxPercent: { type: 'number' },
                  taxAmount: { type: 'number' },
                  grandTotal: { type: 'number' },
                },
              },
            },
          },
          example: {
            success: true,
            data: {
              vendorId: '507f1f77bcf86cd799439011',
              vendor: { _id: '507f1f77bcf86cd799439011', name: 'Pizza House' },
              items: [{ productId: '507f1f77bcf86cd799439013', product: productItem, qty: 2, price: 12.99 }],
              subtotal: 25.98,
              deliveryFee: 2.0,
              taxPercent: 5,
              taxAmount: 1.299,
              grandTotal: 29.279,
            },
          },
        },
      },
    },
    'POST /api/v1/app/orders': {
      description: 'Created',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  orderNumber: { type: 'string' },
                  displayOrderId: { type: 'string', example: '#RDY-82X1Q7' },
                  status: { type: 'string', example: 'pending' },
                  deliveryOtp: { type: 'string', example: '4831' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        qty: { type: 'integer' },
                        quantity: { type: 'integer' },
                        unitPrice: { type: 'number' },
                        subtotal: { type: 'number' },
                        lineTotal: { type: 'number' },
                        itemId: { type: 'string' },
                      },
                    },
                  },
                  subtotal: { type: 'number' },
                  deliveryFee: { type: 'number' },
                  discount: { type: 'number' },
                  grandTotal: { type: 'number' },
                  totalAmount: { type: 'number' },
                  totals: {
                    type: 'object',
                    properties: {
                      subtotal: { type: 'number' },
                      deliveryFee: { type: 'number' },
                      discount: { type: 'number' },
                      grandTotal: { type: 'number' },
                    },
                  },
                  deliveryAddress: { type: 'object' },
                  paymentStatus: { type: 'string', example: 'pending' },
                  paymentMethod: { type: 'string', example: 'wifipay' },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          example: {
            success: true,
            data: {
              _id: '69d000abc1234567890def01',
              orderNumber: '25000031',
              displayOrderId: '#RDY-500031',
              status: 'pending',
              deliveryOtp: '4831',
              items: [
                {
                  name: 'Truffle Burger',
                  qty: 2,
                  quantity: 2,
                  unitPrice: 14,
                  subtotal: 28,
                  lineTotal: 28,
                  itemId: '69c39b03a099da275f84dbe5',
                },
                {
                  name: 'Sweet Potato Fries',
                  qty: 1,
                  quantity: 1,
                  unitPrice: 5,
                  subtotal: 5,
                  lineTotal: 5,
                  itemId: '69c39b03a099da275f84dbf0',
                },
              ],
              subtotal: 33,
              deliveryFee: 2,
              discount: 0,
              grandTotal: 35,
              totalAmount: 35,
              totals: {
                subtotal: 33,
                deliveryFee: 2,
                discount: 0,
                grandTotal: 35,
              },
              deliveryAddress: {
                street: '123 Main St, Apt 4',
                city: 'Berlin',
                country: 'Germany',
                lat: 52.52,
                lng: 13.405,
                contactName: 'John Doe',
                contactPhone: '+491234567890',
              },
              paymentStatus: 'pending',
              paymentMethod: 'wifipay',
              createdAt: '2026-03-27T10:12:00.000Z',
            },
          },
        },
      },
    },
    'GET /api/v1/vendor/orders': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  orders: { type: 'array', items: { type: 'object' } },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  pages: { type: 'integer' },
                },
              },
            },
          },
          example: { success: true, data: { orders: [], total: 0, page: 1, pages: 0 } },
        },
      },
    },
    'GET /api/v1/vendor/orders/new': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  orders: { type: 'array', items: { type: 'object' } },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  pages: { type: 'integer' },
                },
              },
            },
          },
          example: { success: true, data: { orders: [], total: 0, page: 1, pages: 0 } },
        },
      },
    },
    'GET /api/v1/vendor/orders/current': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  orders: { type: 'array', items: { type: 'object' } },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  pages: { type: 'integer' },
                },
              },
            },
          },
          example: { success: true, data: { orders: [], total: 0, page: 1, pages: 0 } },
        },
      },
    },
    'GET /api/v1/vendor/orders/completed': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  orders: { type: 'array', items: { type: 'object' } },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  pages: { type: 'integer' },
                },
              },
            },
          },
          example: { success: true, data: { orders: [], total: 0, page: 1, pages: 0 } },
        },
      },
    },
    'GET /api/v1/vendor/test/nearby-drivers': {
      description: 'TEMPORARY — nearby drivers for logged-in vendor (remove route later)',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  vendorLat: { type: 'number' },
                  vendorLng: { type: 'number' },
                  radiusKm: { type: 'number' },
                  count: { type: 'integer' },
                  drivers: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
          example: {
            success: true,
            data: {
              vendorLat: 52.52,
              vendorLng: 13.405,
              radiusKm: 5,
              count: 2,
              drivers: [
                {
                  _id: '507f1f77bcf86cd799439011',
                  name: 'Driver One',
                  distanceKm: 1.2,
                  liveLocation: { type: 'Point', coordinates: [13.41, 52.53] },
                },
              ],
            },
          },
        },
      },
    },
    'GET /api/v1/driver/notifications': {
      description: 'Success — paginated notifications + unreadCount',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  notifications: { type: 'array', items: { type: 'object' } },
                  unreadCount: { type: 'integer', example: 2 },
                  pagination: {
                    type: 'object',
                    properties: {
                      page: { type: 'integer' },
                      limit: { type: 'integer' },
                      total: { type: 'integer' },
                      totalPages: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
          example: {
            success: true,
            data: {
              notifications: [
                {
                  _id: '507f1f77bcf86cd799439011',
                  driver: '507f1f77bcf86cd799439012',
                  type: 'new_order',
                  title: 'New Order Available',
                  body: 'A new delivery request is nearby…',
                  orderId: '507f1f77bcf86cd799439013',
                  data: { estimatedPayout: 3.5, orderNumber: 'ORD-20250406-ABC123' },
                  read: false,
                  createdAt: '2026-04-06T12:00:00.000Z',
                },
              ],
              unreadCount: 1,
              pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            },
          },
        },
      },
    },
    'PATCH /api/v1/driver/notifications/read-all': {
      description: 'Success — all notifications marked read',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', properties: { updated: { type: 'integer', example: 3 } } },
            },
          },
          example: { success: true, data: { updated: 3 } },
        },
      },
    },
    'GET /api/v1/driver/orders/:id/detail': {
      description: 'Success — delivery detail payload (map, pickup, dropoff, items, earnings)',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', description: 'orderId, orderNumber, status, map, pickup, dropoff, customerNote, items, itemCount, earnings' },
            },
          },
          example: {
            success: true,
            data: {
              orderId: '507f1f77bcf86cd799439011',
              orderNumber: 'ORD-20250406-ABC123',
              status: 'preparing',
              map: { pickupLat: 52.52, pickupLng: 13.405, dropoffLat: 52.53, dropoffLng: 13.41 },
              pickup: {
                restaurantName: 'Pizza House',
                address: 'Main St 1, Berlin, Germany',
                lat: 52.52,
                lng: 13.405,
                phone: '+252600000000',
              },
              dropoff: {
                customerName: 'Jane',
                address: 'Side St 2, Berlin, Germany',
                lat: 52.53,
                lng: 13.41,
                phone: '+252611111111',
                avatarUrl: null,
                rating: null,
                reviewCount: 0,
              },
              customerNote: '',
              items: [{ name: 'Margherita', quantity: 2, notes: '', unitPrice: 12.99 }],
              itemCount: 1,
              earnings: { deliveryFee: 3.5, tip: 0, totalPayout: 3.5 },
            },
          },
        },
      },
    },
    'GET /api/v1/driver/kyc/status': {
      description: 'Success — use for app routing (not_submitted | pending | approved | rejected)',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  profileImage: { type: 'string', nullable: true },
                  vehicleType: { type: 'string', nullable: true },
                  vehicleNumber: { type: 'string', nullable: true },
                  approvalStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
                  kycStatus: {
                    type: 'string',
                    enum: ['not_submitted', 'pending', 'approved', 'rejected'],
                  },
                  kycRejectionReason: { type: 'string', nullable: true },
                  kycSubmittedAt: { type: 'string', format: 'date-time', nullable: true },
                  kycDocuments: {
                    type: 'object',
                    properties: {
                      driversLicense: { type: 'string', nullable: true },
                      nationalId: { type: 'array', items: { type: 'string' } },
                      vehiclePhotos: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
          example: {
            success: true,
            data: {
              name: 'Driver 123456',
              phone: '+252612345678',
              profileImage: null,
              vehicleType: 'car',
              vehicleNumber: 'ABC-123',
              approvalStatus: 'approved',
              kycStatus: 'pending',
              kycRejectionReason: null,
              kycSubmittedAt: '2025-03-26T12:00:00.000Z',
              kycDocuments: {
                driversLicense: '/uploads/driver-kyc/sample-license.pdf',
                nationalId: ['/uploads/driver-kyc/id-front.jpg'],
                vehiclePhotos: ['/uploads/driver-kyc/vehicle-1.jpg', '/uploads/driver-kyc/vehicle-2.jpg'],
              },
            },
          },
        },
      },
    },
    'POST /api/v1/driver/kyc/upload': {
      description:
        'Success — `kycStatus` becomes `pending` and vehicleType/vehicleNumber are saved. Server emits **Socket.IO** `driver:kyc_submitted` to room `admin` with `{ driverId, name, phone, submittedAt }` (ISO). Errors: 422 wrong MIME / missing fields (`data.missing`), 413 file too large.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  vehicleType: { type: 'string', example: 'car' },
                  vehicleNumber: { type: 'string', example: 'ABC-123' },
                  kycStatus: { type: 'string', example: 'pending' },
                  kycSubmittedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          example: {
            success: true,
            data: {
              message: 'Documents submitted successfully',
              vehicleType: 'car',
              vehicleNumber: 'ABC-123',
              kycStatus: 'pending',
              kycSubmittedAt: '2025-03-26T12:00:00.000Z',
            },
          },
        },
      },
    },
    'PATCH /api/v1/driver/kyc/resubmit': {
      description:
        'Success — only when `kycStatus` was `rejected`; sets `not_submitted` and clears `kycRejectionReason`. Driver app should navigate to document upload with empty file state.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object', properties: { kycStatus: { type: 'string', example: 'not_submitted' } } },
            },
          },
          example: { success: true, data: { kycStatus: 'not_submitted' } },
        },
      },
    },
  };
  return map[opKey];
}

/** Return request body spec for Swagger UI by "METHOD path" key. */
function getRequestBodyForRoute(opKey: string): Record<string, unknown> | undefined {
  const json = (schema: Record<string, unknown>) => ({ content: { 'application/json': { schema } } });
  const adminLogin = json({
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'admin@deliveryapp.com' },
      password: { type: 'string', format: 'password', example: 'Admin@12345' },
    },
  });
  const customerSendOtpBody = json({
    type: 'object',
    required: ['phone'],
    properties: { phone: { type: 'string', example: '+252612345678', description: 'E.164 format' } },
  });
  const customerVerifyOtpBody = json({
    type: 'object',
    required: ['phone', 'otp'],
    properties: {
      phone: { type: 'string', example: '+252612345678' },
      otp: { type: 'string', example: '1234', description: '4-digit OTP' },
    },
  });
  const customerRefreshBody = json({
    type: 'object',
    required: ['refreshToken'],
    properties: { refreshToken: { type: 'string', description: 'Refresh token from verify-otp', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' } },
  });
  const customerLogoutBody = json({
    type: 'object',
    properties: { refreshToken: { type: 'string', description: 'Optional; invalidate this token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' } },
  });
  const appRefresh = json({ type: 'object', properties: { refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' } } });
  const orderStatus = json({
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['pending', 'vendor_notified', 'accepted', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered', 'cancelled'], example: 'accepted' },
      note: { type: 'string', example: 'Order confirmed by restaurant', description: 'Optional note' },
    },
  });
  const assignDriver = json({ type: 'object', required: ['driverId'], properties: { driverId: { type: 'string', example: '507f1f77bcf86cd799439011', description: 'Driver ObjectId' } } });
  const blockCustomer = json({
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'blocked'], example: 'blocked' },
      reason: { type: 'string', example: 'Terms violation', description: 'Required when blocking' },
    },
  });
  const userStatus = json({
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'string', enum: ['active', 'inactive'], example: 'active' } },
  });
  const customerProfileUpdate = {
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: {
            fullName: { type: 'string', description: 'Full name', example: 'John Doe' },
            phone: { type: 'string', description: 'Phone (E.164)', example: '+252612345678' },
            profileImage: { type: 'string', format: 'binary', description: 'Profile image file' },
          },
          description: 'Customer profile: only fullName, phone, profileImage.',
        },
      },
    },
  };
  const customerFcmToken = json({
    type: 'object',
    properties: { fcmToken: { type: 'string', description: 'FCM device token', example: 'dG9rZW4...' } },
  });
  const addAddressBody = json({
    type: 'object',
    required: ['addressLine1', 'saveAddressType', 'city', 'country'],
    properties: {
      addressLine1: { type: 'string', example: '123 Main St' },
      addressLine2: { type: 'string', example: 'Apt 4' },
      landmark: { type: 'string', example: 'Near city mall' },
      saveAddressType: { type: 'string', enum: ['home', 'work', 'other'] },
      city: { type: 'string', example: 'Berlin' },
      country: { type: 'string', example: 'Germany' },
      lat: { type: 'number' },
      lng: { type: 'number' },
    },
  });
  const updateAddressBody = json({
    type: 'object',
    properties: {
      addressLine1: { type: 'string', example: '123 Main St' },
      addressLine2: { type: 'string', example: 'Apt 4' },
      landmark: { type: 'string', example: 'Near city mall' },
      saveAddressType: { type: 'string', enum: ['home', 'work', 'other'], example: 'home' },
      city: { type: 'string', example: 'Berlin' },
      country: { type: 'string', example: 'Germany' },
      lat: { type: 'number', example: 52.52 },
      lng: { type: 'number', example: 13.405 },
      preferred: { type: 'boolean', description: 'Set true to make this the only preferred delivery address' },
    },
  });
  const categoryCreateUpdate = {
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Category name (required)', example: 'Burgers' },
            type: { type: 'string', enum: ['food', 'grocery', 'pharmacy', 'fashion'], description: 'Category type (required)', example: 'food' },
            description: { type: 'string', description: 'Optional description', example: 'Burgers and fries' },
            sortOrder: { type: 'integer', description: 'Sort order (default 0)', example: 0 },
            isActive: { type: 'boolean', description: 'Active flag (update only)', example: true },
            icon: { type: 'string', format: 'binary', description: 'Icon image (JPEG/PNG, max 2MB)' },
          },
        },
      },
    },
  };
  const categoryReorder = json({
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'sortOrder'],
      properties: {
        id: { type: 'string', description: 'Category ObjectId' },
        sortOrder: { type: 'integer', description: 'New sort order' },
      },
    },
    example: [{ id: '507f1f77bcf86cd799439011', sortOrder: 0 }, { id: '507f1f77bcf86cd799439012', sortOrder: 1 }],
  });
  const vendorSendOtpBody = json({
    type: 'object',
    required: ['phone'],
    properties: { phone: { type: 'string', example: '+252612345678', description: 'E.164 format' } },
  });
  const vendorVerifyOtpBody = json({
    type: 'object',
    required: ['phone', 'otp'],
    properties: {
      phone: { type: 'string', example: '+252612345678' },
      otp: { type: 'string', example: '1234', description: '4-digit OTP' },
    },
  });
  const vendorResendOtpBody = json({
    type: 'object',
    required: ['phone'],
    properties: { phone: { type: 'string', example: '+252612345678' } },
  });
  const vendorRefreshBody = json({
    type: 'object',
    required: ['refreshToken'],
    properties: { refreshToken: { type: 'string', description: 'Refresh token from verify-otp', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' } },
  });
  const vendorLogoutBody = json({
    type: 'object',
    properties: {
      refreshToken: { type: 'string', description: 'Optional; invalidate this token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      fcmToken: { type: 'string', description: 'Optional; remove from vendor.fcmTokens', example: 'dG9rZW4...' },
    },
  });

  const driverSendOtpBody = json({
    type: 'object',
    required: ['phone'],
    properties: { phone: { type: 'string', example: '+252612345678', description: 'E.164 format' } },
  });

  const driverVerifyOtpBody = json({
    type: 'object',
    required: ['phone', 'otp'],
    properties: {
      phone: { type: 'string', example: '+252612345678' },
      otp: { type: 'string', example: '1234', description: '4-digit OTP' },
    },
  });

  const driverResendOtpBody = json({
    type: 'object',
    required: ['phone'],
    properties: { phone: { type: 'string', example: '+252612345678' } },
  });

  const driverRefreshBody = json({
    type: 'object',
    required: ['refreshToken'],
    properties: { refreshToken: { type: 'string', description: 'Refresh token from verify-otp', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' } },
  });

  const driverLogoutBody = json({
    type: 'object',
    properties: {
      refreshToken: { type: 'string', description: 'Optional; invalidate this token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      fcmToken: { type: 'string', description: 'Optional; remove from driver.fcmTokens', example: 'dG9rZW4...' },
    },
  });

  const driverProfileInfoBody = {
    description: 'Driver profile info (multipart). `name` required. `phone` optional (same phone as registration is allowed). `profileImage` optional (JPEG/PNG/WEBP, max 2MB).',
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', description: 'Driver name', example: 'Ahmed Hassan' },
            phone: { type: 'string', description: 'Optional phone (string; usually E.164)', example: '+252612345678' },
            profileImage: { type: 'string', format: 'binary', description: 'Optional profile image file (max 2MB)' },
          },
        },
      },
    },
  };

  const driverSelfProfilePatchBody = {
    description: 'Driver self profile update (multipart). All fields optional: name, phone, profileImage (2MB, jpeg/png/webp), vehicleType, vehicleNumber.',
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Ahmed Driver' },
            phone: { type: 'string', example: '+252612345678' },
            profileImage: { type: 'string', format: 'binary', description: 'Optional image (max 2MB)' },
            vehicleType: { type: 'string', enum: ['bike', 'car', 'scooter', 'van', 'bicycle'], example: 'car' },
            vehicleNumber: { type: 'string', example: 'ABC-123' },
          },
        },
      },
    },
  };

  const driverFcmTokenBody = json({
    type: 'object',
    required: ['token'],
    properties: {
      token: { type: 'string', example: 'fcm-token...' },
      device: { type: 'string', example: 'android', description: 'Optional device label' },
    },
  });

  const driverStatusBody = json({
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['online', 'offline'], example: 'online' },
    },
  });

  const driverLocationPatchBody = json({
    type: 'object',
    required: ['lat', 'lng'],
    properties: {
      lat: { type: 'number', example: 52.52 },
      lng: { type: 'number', example: 13.405 },
      heading: { type: 'number', nullable: true, description: 'Optional compass heading (degrees)' },
    },
  });

  const driverKycUploadBody = {
    description:
      'Driver KYC upload. Required fields: vehicleType, vehicleNumber and file groups driversLicense (1 file), nationalId (1–10 files), vehiclePhotos (1–10 files). Allowed: image/jpeg, image/png, application/pdf. Max size: 5MB per file.',
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['vehicleType', 'vehicleNumber', 'driversLicense', 'nationalId', 'vehiclePhotos'],
          properties: {
            vehicleType: { type: 'string', enum: ['bike', 'car', 'scooter', 'van', 'bicycle'], example: 'car' },
            vehicleNumber: { type: 'string', example: 'ABC-123', description: 'Vehicle number (saved uppercased)' },
            driversLicense: { type: 'string', format: 'binary', description: 'Single image or PDF' },
            nationalId: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description: 'One or more images/PDFs; use the same field name `nationalId` for each file',
            },
            vehiclePhotos: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description: 'One or more images/PDFs; use the same field name `vehiclePhotos` for each file',
            },
          },
        },
      },
    },
  };

  const map: Record<string, Record<string, unknown>> = {
    'POST /api/v1/auth/admin/login': adminLogin,
    'POST /api/v1/auth/customer/send-otp': customerSendOtpBody,
    'POST /api/v1/auth/customer/verify-otp': customerVerifyOtpBody,
    'POST /api/v1/auth/customer/resend-otp': customerSendOtpBody,
    'POST /api/v1/auth/customer/refresh': customerRefreshBody,
    'POST /api/v1/auth/customer/logout': customerLogoutBody,
    'PATCH /api/v1/admin/orders/:id/status': orderStatus,
    'PATCH /api/v1/admin/orders/:id/assign-driver': assignDriver,
    'PATCH /api/v1/admin/orders/:id/driver': assignDriver,
    'PATCH /api/v1/admin/customers/:id/block': blockCustomer,
    'PATCH /api/v1/admin/users/:id/status': userStatus,
    'PUT /api/v1/app/customer/profile': customerProfileUpdate,
    'PUT /api/v1/app/customer/fcm-token': customerFcmToken,
    'POST /api/v1/app/customer/addresses': addAddressBody,
    'PUT /api/v1/app/customer/addresses/:id': updateAddressBody,
    'POST /api/v1/admin/categories': categoryCreateUpdate,
    'PATCH /api/v1/admin/categories/:id': categoryCreateUpdate,
    'PATCH /api/v1/admin/categories/reorder': categoryReorder,
    'POST /api/v1/auth/vendor/send-otp': vendorSendOtpBody,
    'POST /api/v1/auth/vendor/verify-otp': vendorVerifyOtpBody,
    'POST /api/v1/auth/vendor/resend-otp': vendorResendOtpBody,
    'POST /api/v1/auth/vendor/refresh': vendorRefreshBody,
    'POST /api/v1/auth/vendor/logout': vendorLogoutBody,
    'POST /api/v1/auth/driver/send-otp': driverSendOtpBody,
    'POST /api/v1/auth/driver/verify-otp': driverVerifyOtpBody,
    'POST /api/v1/auth/driver/resend-otp': driverResendOtpBody,
    'POST /api/v1/auth/driver/refresh': driverRefreshBody,
    'POST /api/v1/auth/driver/logout': driverLogoutBody,
    'PATCH /api/v1/driver/setup/profile-info': driverProfileInfoBody,
    'PATCH /api/v1/driver/profile': driverSelfProfilePatchBody,
    'POST /api/v1/driver/profile/fcm-token': driverFcmTokenBody,
    'DELETE /api/v1/driver/profile/fcm-token': json({
      type: 'object',
      required: ['token'],
      properties: { token: { type: 'string', example: 'fcm-token...' } },
    }),
    'PATCH /api/v1/driver/profile/status': driverStatusBody,
    'PATCH /api/v1/driver/location': driverLocationPatchBody,
    'POST /api/v1/driver/kyc/upload': driverKycUploadBody,
    'PATCH /api/v1/vendor/profile': {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'My Restaurant' },
              phone: { type: 'string', example: '+252612345678', description: 'Unique phone (E.164)' },
              logo: { type: 'string', format: 'binary', description: 'image/*, max 2MB' },
              coverImage: { type: 'string', format: 'binary', description: 'image/*, max 5MB' },
              deliveryTime: { type: 'number', example: 30, description: 'Minutes (min 1)' },
              minimumOrder: { type: 'number', example: 10, description: 'Min 0' },
              address: {
                type: 'string',
                example: '{"street":"123 Main St","city":"Berlin","lat":52.52,"lng":13.405}',
                description: 'JSON string: { street, city, lat, lng }',
              },
            },
          },
        },
      },
    },
    'PATCH /api/v1/vendor/profile/operating-hours': json({
      type: 'object',
      required: ['operatingHours'],
      properties: {
        operatingHours: {
          type: 'array',
          minItems: 7,
          maxItems: 7,
          items: {
            type: 'object',
            required: ['day', 'isOpen'],
            properties: {
              day: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], example: 'mon' },
              isOpen: { type: 'boolean', example: true },
              from: { type: 'string', example: '09:00', nullable: true },
              to: { type: 'string', example: '22:00', nullable: true },
            },
          },
          example: [
            { day: 'mon', isOpen: true, from: '09:00', to: '22:00' },
            { day: 'tue', isOpen: true, from: '09:00', to: '22:00' },
            { day: 'wed', isOpen: true, from: '09:00', to: '22:00' },
            { day: 'thu', isOpen: true, from: '09:00', to: '22:00' },
            { day: 'fri', isOpen: true, from: '09:00', to: '22:00' },
            { day: 'sat', isOpen: true, from: '09:00', to: '22:00' },
            { day: 'sun', isOpen: false, from: null, to: null },
          ],
        },
      },
    }),
    'PATCH /api/v1/vendor/onboarding/business-info': {
      description: 'Vendor onboarding step 2. **Required:** `storeName` only. Optional: `description`, `operatingHours` (JSON string), `logo`. The `storeType` field is **not** accepted; vendor categories are not set from this endpoint.',
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            description: 'Multipart fields for business info. Do not send storeType.',
            required: ['storeName'],
            properties: {
              storeName: { type: 'string', description: 'Store name', example: 'My Restaurant' },
              description: { type: 'string', example: 'Best food in town', description: 'Optional store description' },
              operatingHours: {
                type: 'string',
                description: 'JSON array of { day, isOpen, from?, to? }. day: mon|tue|wed|thu|fri|sat|sun; from/to: "HH:MM"',
                example: '[{"day":"mon","isOpen":true,"from":"09:00","to":"18:00"},{"day":"tue","isOpen":true,"from":"09:00","to":"18:00"},{"day":"wed","isOpen":true,"from":"09:00","to":"18:00"},{"day":"thu","isOpen":true,"from":"09:00","to":"18:00"},{"day":"fri","isOpen":true,"from":"09:00","to":"21:00"},{"day":"sat","isOpen":true,"from":"10:00","to":"20:00"},{"day":"sun","isOpen":false}]',
              },
              logo: { type: 'string', format: 'binary', description: 'Image file, max 2MB' },
            },
          },
        },
      },
    },
    'PATCH /api/v1/vendor/onboarding/address': json({
      type: 'object',
      required: ['addressLine1', 'lat', 'lng'],
      properties: {
        addressLine1: { type: 'string', example: '123 Main St' },
        addressLine2: { type: 'string', example: 'Suite 100' },
        landmark: { type: 'string', example: 'Near central station' },
        lat: { type: 'number', example: 52.52 },
        lng: { type: 'number', example: 13.405 },
        addressLabel: { type: 'string', enum: ['home', 'work', 'other'], example: 'work' },
      },
    }),
    'POST /api/v1/vendor/onboarding/kyc-documents': {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['businessRegistration', 'identityDocument'],
            properties: {
              businessRegistration: { type: 'string', format: 'binary', description: 'Required; image or PDF, 5MB' },
              identityDocument: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'Required; one or more identity documents (image or PDF, 5MB each); same field name for multiple files' },
              healthSafetyLicense: { type: 'string', format: 'binary', description: 'Optional; image or PDF, 5MB' },
            },
          },
        },
      },
    },
    'PATCH /api/v1/admin/vendors/:id/block': json({
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Policy violation', description: 'Required when blocking' },
      },
    }),
    'PATCH /api/v1/admin/vendors/:id/reject': json({
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'Incomplete KYC documents. Please upload a valid business registration.', description: 'Min 10 characters' },
      },
    }),
    'POST /api/v1/admin/vendors': {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', example: 'New Vendor' },
              slug: { type: 'string', example: 'new-vendor' },
              description: { type: 'string', example: 'Vendor description' },
              email: { type: 'string', format: 'email', example: 'vendor@example.com' },
              phone: { type: 'string', example: '+252612345678' },
              logo: { type: 'string', format: 'binary' },
              coverImage: { type: 'string', format: 'binary' },
            },
          },
        },
      },
    },
    'PATCH /api/v1/admin/vendors/:id': {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Updated Vendor Name' },
              slug: { type: 'string', example: 'updated-vendor' },
              description: { type: 'string', example: 'Updated description' },
              email: { type: 'string', format: 'email', example: 'vendor@example.com' },
              phone: { type: 'string', example: '+252612345678' },
              status: { type: 'string', enum: ['active', 'blocked'], example: 'active' },
              logo: { type: 'string', format: 'binary' },
              coverImage: { type: 'string', format: 'binary' },
            },
          },
        },
      },
    },
    'POST /api/v1/admin/vendors/:id/menu-items': {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['name', 'price', 'category'],
            properties: {
              name: { type: 'string', example: 'Cheese Burger' },
              description: { type: 'string', example: 'Juicy beef with cheese' },
              price: { type: 'number', example: 9.99 },
              category: { type: 'string', example: 'burgers' },
              isAvailable: { type: 'boolean', example: true },
              sortOrder: { type: 'integer', example: 0 },
              image: { type: 'string', format: 'binary' },
            },
          },
        },
      },
    },
    'PATCH /api/v1/admin/vendors/:id/menu-items/:itemId': {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Cheese Burger' },
              description: { type: 'string', example: 'Juicy beef with cheese' },
              price: { type: 'number', example: 9.99 },
              category: { type: 'string', example: 'burgers' },
              isAvailable: { type: 'boolean', example: true },
              sortOrder: { type: 'integer', example: 0 },
              image: { type: 'string', format: 'binary' },
            },
          },
        },
      },
    },
    'POST /api/v1/vendor/products': {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['name', 'price', 'category'],
            properties: {
              name: { type: 'string', example: 'Margherita Pizza' },
              description: { type: 'string', example: 'Tomato and mozzarella' },
              price: { type: 'number', example: 12.99 },
              category: { type: 'string', description: 'Category ObjectId (from GET /vendor/categories)' },
              image: { type: 'string', format: 'binary', description: 'Optional; 2MB max, image/*' },
              sortOrder: { type: 'integer', example: 0 },
            },
          },
        },
      },
    },
    'PATCH /api/v1/vendor/products/:id': {
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Margherita Pizza (Large)' },
              description: { type: 'string' },
              price: { type: 'number', example: 14.99 },
              category: { type: 'string' },
              image: { type: 'string', format: 'binary' },
              isAvailable: { type: 'boolean' },
              sortOrder: { type: 'integer' },
            },
          },
        },
      },
    },
    'PATCH /api/v1/admin/orders/:id/cancel': json({
      type: 'object',
      required: ['reason'],
      properties: { reason: { type: 'string', example: 'Customer requested cancellation' } },
    }),
    'PATCH /api/v1/admin/drivers/:id/reject': json({
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', minLength: 10, example: 'Documents did not meet requirements' },
        kycRejectionReason: {
          type: 'string',
          description: 'Optional; shown to driver for KYC. Defaults to `reason` when omitted.',
          example: 'License image unclear',
        },
      },
    }),
    'POST /api/v1/app/cart': json({
      type: 'object',
      required: ['vendorId', 'items'],
      properties: {
        vendorId: { type: 'string', example: '507f1f77bcf86cd799439011', description: 'Vendor (restaurant) ObjectId' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['productId', 'qty'],
            properties: {
              productId: { type: 'string', example: '507f1f77bcf86cd799439013' },
              qty: { type: 'integer', minimum: 1, example: 2 },
            },
          },
          example: [{ productId: '507f1f77bcf86cd799439013', qty: 2 }],
        },
      },
    }),
    'PATCH /api/v1/app/cart/item': json({
      type: 'object',
      required: ['productId', 'qty'],
      properties: {
        productId: { type: 'string', example: '507f1f77bcf86cd799439013' },
        qty: { type: 'integer', minimum: 0, example: 2, description: '0 to remove item from cart' },
      },
    }),
    'POST /api/v1/app/orders': json({
      type: 'object',
      required: ['deliveryAddressId'],
      properties: {
        deliveryAddressId: {
          type: 'string',
          example: '69c6116f7c838a7867cb372a',
          description: 'Preferred saved address _id to place order. Recommended.',
        },
        deliveryAddress: {
          type: 'object',
          required: ['addressLine1', 'city', 'country'],
          properties: {
            _id: { type: 'string', example: '69c6116f7c838a7867cb372a', description: 'Optional saved address _id' },
            addressId: { type: 'string', example: '69c6116f7c838a7867cb372a', description: 'Optional alias of saved address _id' },
            addressLine1: { type: 'string', example: '123 Main St' },
            addressLine2: { type: 'string', example: 'Apt 4' },
            street: { type: 'string', example: '123 Main St, Apt 4' },
            city: { type: 'string', example: 'Berlin' },
            country: { type: 'string', example: 'Germany' },
            lat: { type: 'number', example: 52.52 },
            lng: { type: 'number', example: 13.405 },
            contactName: { type: 'string', example: 'John Doe' },
            contactPhone: { type: 'string', example: '+491234567890' },
          },
          example: {
            _id: '69c6116f7c838a7867cb372a',
            addressLine1: '123 Main St',
            addressLine2: 'Apt 4',
            city: 'Berlin',
            country: 'Germany',
            lat: 52.52,
            lng: 13.405,
            contactName: 'John Doe',
            contactPhone: '+491234567890',
          },
          description: 'Optional fallback object; use deliveryAddressId for production flow.',
        },
        usePoints: { type: 'integer', example: 0, description: 'Optional points to redeem' },
        deliveryInstructions: { type: 'string', example: 'Ring the bell', description: 'Optional instructions' },
      },
    }),
    'POST /api/v1/app/orders/:id/rate': json({
      type: 'object',
      required: ['rating'],
      properties: {
        rating: { type: 'number', minimum: 1, maximum: 5, example: 5 },
        comment: { type: 'string', example: 'Great food!' },
      },
    }),
    'PATCH /api/v1/app/orders/:id/cancel': json({
      type: 'object',
      properties: { reason: { type: 'string', example: 'Changed my mind' } },
    }),
    'PUT /api/v1/app/driver/profile': json({
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Driver Name' },
        phone: { type: 'string', example: '+252612345678' },
        vehicleType: { type: 'string', example: 'bike' },
        vehiclePlate: { type: 'string', example: 'AB-123' },
      },
    }),
    'PUT /api/v1/app/driver/fcm-token': json({
      type: 'object',
      properties: { fcmToken: { type: 'string', example: 'dG9rZW4...' } },
    }),
    'PATCH /api/v1/app/driver/online-status': json({
      type: 'object',
      required: ['isOnline'],
      properties: { isOnline: { type: 'boolean', example: true } },
    }),
    'PUT /api/v1/app/driver/location': json({
      type: 'object',
      required: ['lat', 'lng'],
      properties: {
        lat: { type: 'number', example: 52.52 },
        lng: { type: 'number', example: 13.405 },
      },
    }),
    'PATCH /api/v1/app/driver/orders/:id/status': json({
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', enum: ['picked_up', 'on_the_way', 'delivered'], example: 'picked_up' } },
    }),
    'PATCH /api/v1/driver/orders/:id/status': json({
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', enum: ['picked_up', 'on_the_way', 'delivered'], example: 'picked_up' } },
    }),
    'PATCH /api/v1/app/driver/orders/:id/deliver': json({
      type: 'object',
      required: ['otp'],
      properties: { otp: { type: 'string', example: '1234', description: '4-digit delivery OTP' } },
    }),
    'PATCH /api/v1/driver/orders/:id/deliver': json({
      type: 'object',
      required: ['otp'],
      properties: { otp: { type: 'string', example: '1234', description: '4-digit delivery OTP' } },
    }),
    'POST /api/v1/payment/initiate': json({
      type: 'object',
      required: ['orderId', 'amount'],
      properties: {
        orderId: { type: 'string', example: '507f1f77bcf86cd799439011' },
        amount: { type: 'number', example: 29.99 },
        currency: { type: 'string', example: 'USD' },
      },
    }),
    'POST /api/v1/payment/refund': json({
      type: 'object',
      required: ['reference'],
      properties: {
        reference: { type: 'string', example: 'REF-12345' },
        reason: { type: 'string', example: 'Customer request' },
      },
    }),
    'PATCH /api/v1/vendor/orders/:id/status': orderStatus,
    'PATCH /api/v1/vendor/orders/:id/reject': json({
      type: 'object',
      required: ['reason'],
      properties: { reason: { type: 'string', example: 'Cannot fulfill this order', description: 'Required rejection reason' } },
    }),
  };
  return map[opKey];
}


/** Build OpenAPI 3.0 spec from ROUTES for Swagger UI and tooling */
export function getOpenApiSpec(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of ROUTES) {
    const pathKey = toOpenApiPath(r.path);
    const method = r.method.toLowerCase();
    if (!paths[pathKey]) paths[pathKey] = {};
    const opKey = `${r.method} ${r.path}`;
    const requestBody = getRequestBodyForRoute(opKey);
    const pathParams = getParametersForPath(r.path);
    const queryParams = getQueryParametersForRoute(opKey);
    const allParams = [...pathParams, ...queryParams];
    const responseExample = getResponseExampleForRoute(opKey);
    const operation: Record<string, unknown> = {
      summary: r.description,
      description: r.description + (r.auth ? ' Requires authentication.' : ''),
      security: r.auth ? [{ cookieAuth: [] }, { bearerAuth: [] }] : [],
      tags: [],
      responses: {
        '200': responseExample ?? { description: 'Success' },
        '201': { description: 'Created' },
        '204': { description: 'No content (e.g. DELETE product)' },
        '400': { description: 'Bad request' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden (e.g. vendor blocked)' },
        '404': { description: 'Not found' },
        '409': { description: 'Conflict (e.g. category in use by vendors)' },
        '410': { description: 'Gone (e.g. OTP expired)' },
        '422': { description: 'Unprocessable (e.g. onboarding submit when steps incomplete; body may include missingSteps)' },
        '429': { description: 'Too many requests (e.g. OTP rate limit; body may include waitMinutes)' },
      },
    };
    if (allParams.length > 0) operation.parameters = allParams;
    if (requestBody) operation.requestBody = requestBody;
    const tag = r.path.includes('/auth/admin')
      ? 'Admin'
      : r.path.includes('/auth/customer')
        ? 'Auth – Customer'
        : r.path.includes('/auth/vendor')
          ? 'Auth – Vendor'
          : r.path.includes('/auth/driver')
            ? 'Auth – Driver'
            : r.path.includes('/app/driver/')
              ? 'Driver'
              : r.path.includes('/driver/')
                ? 'Driver'
                : r.path.includes('/vendor/')
                  ? 'Vendor'
                  : r.path.includes('/admin/')
                    ? 'Admin'
                    : r.path.includes('/app/')
                      ? 'App – Customer'
                      : r.path.includes('payment')
                        ? 'Payment'
                        : 'General';
    operation.tags = [tag];
    (paths[pathKey] as Record<string, unknown>)[method] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Goo-Gaa Station API',
      description:
        'Backend API: Admin (cookies). **App – Customer:** /app/cart, /app/orders, /app/customer, discovery. **Driver:** /driver/setup, /driver/kyc, /driver/profile, /driver/location, /driver/notifications, /driver/orders (Bearer from /auth/driver/verify-otp). Legacy paths under /app/driver/*. **Auth:** /auth/customer, /auth/vendor, /auth/driver (phone OTP). **Vendor:** /vendor/*. **Realtime (Socket.IO v4):** connect with Postman Socket.IO or `ws://host/socket.io/?EIO=4&transport=websocket`; client events e.g. `admin:join`, `customer:join`, `vendor:join`, `driver:join` (JWT), `driver:location_update`. Server emits order/driver events to rooms `vendor:{id}`, `customer:{id}`, `driver:{id}`, `admin`. Payment: WifiPay. OpenAPI: GET /api/openapi.json. Swagger UI: /api-docs.',
      version: '1.0.0',
      contact: { name: 'API Team' },
    },
    servers: [{ url: baseUrl, description: 'API server' }],
    paths,
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'adminAccessToken',
          description: 'Admin auth: login sets adminAccessToken + adminRefreshToken cookies. Send cookies with each request.',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Customer: /auth/customer/verify-otp. Vendor: /auth/vendor/verify-otp. Driver: /auth/driver/verify-otp. Send in header: Authorization: Bearer <accessToken>.',
        },
      },
    },
    tags: [
      { name: 'General', description: 'Health and API info' },
      { name: 'Auth – Customer', description: 'Customer app: send-otp, verify-otp, resend-otp, refresh, logout (phone OTP; body tokens)' },
      { name: 'Auth – Vendor', description: 'Vendor app: send-otp, verify-otp, resend-otp, refresh, logout (phone OTP; Bearer for logout)' },
      { name: 'Auth – Driver', description: 'Driver app: send-otp, verify-otp, resend-otp, refresh, logout (phone OTP; Bearer for logout)' },
      {
        name: 'Driver',
        description:
          'Driver app (Bearer from /auth/driver/verify-otp): setup (/driver/setup), KYC (/driver/kyc), profile (/driver/profile), location (/driver/location), notifications (/driver/notifications), orders (/driver/orders/*, including /:id/detail). Duplicates under /app/driver/*.',
      },
      { name: 'Vendor', description: 'Vendor onboarding: status, business-info, address, contact, kyc-documents, submit (Bearer required)' },
      { name: 'Admin', description: 'Admin panel (cookies from /auth/admin/login)' },
      {
        name: 'App – Customer',
        description: 'Customer app: cart, orders, profile & addresses, vendor/category discovery (Bearer from /auth/customer/verify-otp).',
      },
      { name: 'Payment', description: 'Payment (WifiPay)' },
    ],
  };
}

export function openApiHandler(req: Request, res: Response): void {
  const baseUrl = `${req.protocol}://${req.get('host') || 'localhost:5000'}`;
  res.json(getOpenApiSpec(baseUrl));
}
