# DeliverEats API – App team guide

Base URL and docs for integrating the mobile app (or any client) with the DeliverEats API.

---

## Base URL & environment

- **Local:** `http://localhost:5000` (default port from `PORT` in env).
- **Staging/Production:** Set by backend; ask for the exact URL. The API uses `CLIENT_ORIGIN` and optional `ALLOWED_ORIGINS` for CORS.

All API routes are under `/api`:

- Health: `GET /api/health`
- API v1 welcome: `GET /api/v1`
- All app/admin/payment routes: `/api/v1/...`

---

## Authentication

Two auth flows:

| Audience | Auth method | How to get token |
|----------|-------------|-------------------|
| **Admin (web dashboard)** | Cookie-based | `POST /api/v1/auth/admin/login` with `email` + `password`. Server sets `accessToken` (and optionally refresh) in cookies. Subsequent requests send cookies automatically. |
| **Customer (mobile app)** | Bearer token | Send OTP: `POST /api/v1/auth/customer/send-otp` (body: `phone`). Verify OTP: `POST /api/v1/auth/customer/verify-otp` (body: `phone`, `otp`). Response returns `user`, `accessToken`, `refreshToken`, `expiresIn`. Use `Authorization: Bearer <accessToken>` for `/app/customer/*` routes. |
| **Vendor (vendor app)** | Bearer token | `POST /api/v1/auth/vendor/send-otp` (body: `phone`), then `POST /api/v1/auth/vendor/verify-otp` (body: `phone`, `otp`). Use Bearer for `/vendor/onboarding/*` and vendor routes. |
| **Driver** | Bearer token | Driver auth route TBD. |

- **Customer refresh:** `POST /api/v1/auth/customer/refresh` with `refreshToken` in body.
- **Customer logout:** `POST /api/v1/auth/customer/logout` with optional `refreshToken` in body.
- **Admin logout:** `POST /api/v1/auth/admin/logout` (cookies cleared).

---

## Interactive API docs (Swagger UI)

- **URL:** `http://localhost:5000/api-docs` (replace host/port for staging/prod).
- Use it to browse all operations and **Try it out** against the running server.
- The spec is loaded from the same host, so “Try it out” targets the correct base URL.

---

## OpenAPI spec (for Postman / Insomnia / codegen)

- **URL:** `GET http://localhost:5000/api/openapi.json`
- Returns OpenAPI 3.0 JSON. Use it to:
  - **Postman:** Import → Link → paste the URL (or download JSON and import file).
  - **Insomnia:** Import from URL.
  - Generate client SDKs (e.g. OpenAPI Generator, Swift, Kotlin).

---

## Postman collection

- **File:** `apps/api/DeliverEats-Postman-Collection.json`
- **Import:** Postman → Import → Upload the file (or import from repo path).
- **Variables:** Set at collection level (e.g. `baseUrl`, `accessToken`, `refreshToken`, `userId`, `driverId`, `orderId`, `customerId`, `vendorId`, `itemId`, `transactionId`, `paymentReference`). For admin requests, log in via **Auth – Admin (cookies)** first so cookies are sent. For app requests, set `accessToken` from **Auth – App** login and use **Authorization: Bearer {{accessToken}}** where the collection uses it.

---

## Machine-readable route list

- **URL:** `GET /api/docs`
- Returns a JSON list of all routes (method, path, auth required, short description). Useful for tooling or custom clients.

---

## cURL / HTTP examples

- **`api-curls.md`** – Example cURLs for key flows (login, orders, etc.).
- **`api-tests.http`** – HTTP request file (VS Code REST Client or similar) for quick manual tests.

---

## Quick reference for app flows

1. **Customer:** Register/Login (app) → get `accessToken` → use it in `Authorization: Bearer <token>` for profile, addresses, orders, payment.
2. **Driver:** Register/Login (app) → get `accessToken` → use for profile, online status, location, available/active orders, accept, status updates.
3. **Payments:** Initiate with customer token; status with token; refund with admin cookies.
4. **Admin:** Use only for dashboard; cookie auth after admin login.

For detailed request/response shapes, use **Swagger UI** (`/api-docs`) or the **Postman collection**.
