import { Router } from 'express';
import { env } from '../config/env';
import { docsHandler } from './docs';
import { openApiHandler } from '../openapi';
import authRoutes from './auth.routes';
import customerAuthRoutes from './customerAuth.routes';
import vendorAuthRoutes from './vendorAuth.routes';
import vendorOnboardingRoutes from './vendorOnboarding.routes';
import { authVendor } from '../middlewares/authVendor.middleware';
import { requireApproved } from '../middlewares/requireApproved.middleware';
import vendorCategoriesRoutes from './vendor/categories.routes';
import vendorProductsRoutes from './vendor/products.routes';
import vendorOrdersRoutes from './vendor/orders.routes';
import userAdminRoutes from './admin/userAdmin.routes';
import customerAdminRoutes from './admin/customerAdmin.routes';
import driverAdminRoutes from './admin/driverAdmin.routes';
import orderAdminRoutes from './admin/orderAdmin.routes';
import adminOrdersRoutes from './admin/orders.routes';
import transactionAdminRoutes from './admin/transactionAdmin.routes';
import vendorAdminRoutes from './admin/vendorAdmin.routes';
import categoriesAdminRoutes from './admin/categoriesAdmin.routes';
import customerProfileRoutes from './app/customerProfile.routes';
import profileRoutes from './app/profile.routes';
import ordersRoutes from './app/orders.routes';
import ordersCartRoutes from './app/ordersCart.routes';
import vendorAppRoutes from './app/vendorApp.routes';
import categoriesAppRoutes from './app/categoriesApp.routes';
import productsAppRoutes from './app/productsApp.routes';
import cartRoutes from './app/cart.routes';
import driverProfileRoutes from './app/driverProfile.routes';
import driverOrderRoutes from './app/driverOrder.routes';
import paymentRoutes from './payment.routes';

const router = Router();

/** GET /api/health — { success, env, port, storage, timestamp } */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    env: env.NODE_ENV,
    port: env.PORT,
    storage: env.STORAGE_PROVIDER,
    timestamp: new Date().toISOString(),
  });
});

/** GET /api/docs — machine-readable route map for API consumers */
router.get('/docs', docsHandler);

/** GET /api/openapi.json — OpenAPI 3.0 spec for Swagger UI, Postman, etc. */
router.get('/openapi.json', openApiHandler);

/** Mount v1 API routes (auth, users, orders, etc.) under /api/v1 */
const v1Router = Router();
v1Router.get('/', (_req, res) => {
  res.json({ message: 'DeliverEats API v1' });
});
v1Router.use('/auth', authRoutes);
v1Router.use('/auth/customer', customerAuthRoutes);
v1Router.use('/auth/vendor', vendorAuthRoutes);
v1Router.use('/vendor/onboarding', vendorOnboardingRoutes);
v1Router.use('/vendor/categories', authVendor, requireApproved, vendorCategoriesRoutes);
v1Router.use('/vendor/products', authVendor, requireApproved, vendorProductsRoutes);
v1Router.use('/vendor/orders', authVendor, requireApproved, vendorOrdersRoutes);
v1Router.use('/payment', paymentRoutes);
v1Router.use('/admin/users', userAdminRoutes);
v1Router.use('/admin/customers', customerAdminRoutes);
v1Router.use('/admin/drivers', driverAdminRoutes);
v1Router.use('/admin/orders', adminOrdersRoutes);
v1Router.use('/admin/orders', orderAdminRoutes);
v1Router.use('/admin/transactions', transactionAdminRoutes);
v1Router.use('/admin/vendors', vendorAdminRoutes);
v1Router.use('/admin/categories', categoriesAdminRoutes);
v1Router.use('/app/customer', customerProfileRoutes);
v1Router.use('/app/profile', profileRoutes);
v1Router.use('/app/orders', ordersCartRoutes);
v1Router.use('/app/orders', ordersRoutes);
v1Router.use('/app/vendors', vendorAppRoutes);
v1Router.use('/app/categories', categoriesAppRoutes);
v1Router.use('/app/products', productsAppRoutes);
v1Router.use('/app/cart', cartRoutes);
v1Router.use('/app/driver', driverProfileRoutes);
v1Router.use('/app/driver/orders', driverOrderRoutes);

router.use('/v1', v1Router);

export default router;
