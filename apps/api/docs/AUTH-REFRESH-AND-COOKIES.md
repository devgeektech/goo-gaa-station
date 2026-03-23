# Auth: Refresh Tokens and Cookies

## How it works in this project

The API has **two separate auth flows**:

| | **Admin (web dashboard)** | **Customer (mobile app)** | **Vendor (vendor app)** |
|---|---------------------------|---------------------------|--------------------------|
| **Login** | `POST /api/v1/auth/admin/login` (email + password) | Send OTP: `POST /api/v1/auth/customer/send-otp` (phone), then Verify: `POST /api/v1/auth/customer/verify-otp` (phone + otp) | `POST /api/v1/auth/vendor/send-otp` then `verify-otp` (phone + otp) |
| **Where tokens go** | **Cookies** (httpOnly, sameSite: strict) | **Response body** (JSON) | **Response body** (JSON) |
| **Access token** | Cookie `accessToken` | Header: `Authorization: Bearer <accessToken>` | Header: `Authorization: Bearer <accessToken>` |
| **Refresh endpoint** | `POST /api/v1/auth/admin/refresh` (cookie) | `POST /api/v1/auth/customer/refresh` with body `{ "refreshToken": "..." }` | `POST /api/v1/auth/vendor/refresh` with body `{ "refreshToken": "..." }` |
| **Logout** | `POST /api/v1/auth/admin/logout` | `POST /api/v1/auth/customer/logout` (optional body: refreshToken) | `POST /api/v1/auth/vendor/logout` (Bearer + optional body) |

### Token types and storage

- **Access token**: Short-lived JWT (default 15 min). Used to authenticate each API request.
- **Refresh token**: Long-lived JWT (default 7 days). Used only to get a new access + refresh pair; not sent on every request.
- **Backend**: Refresh tokens are **hashed (SHA-256)** and stored in the `RefreshToken` collection with `userId`, `userModel` (Admin/User/Driver), and `expiresAt`. Raw refresh tokens are never stored.

### Refresh flow (rotation)

On refresh:

1. Backend verifies the refresh token (signature + DB lookup by hash).
2. If valid, the **old** refresh token is deleted from the DB.
3. A **new** access token and a **new** refresh token are issued.
4. **Admin**: both new tokens are set in cookies.
5. **App**: both new tokens are returned in the JSON body; the app must store them and use the new access token for subsequent requests and the new refresh token for the next refresh.

So each refresh “rotates” the refresh token (one-time use per token).

### How the API decides which token to use

In `auth.middleware.ts`, `getAccessToken(req)`:

- First checks **cookie** `accessToken` (admin).
- If missing, checks **header** `Authorization: Bearer <token>` (app).

So admin uses cookies; app uses Bearer. No mixing.

---

## What to explain to the app developer

Give them this section (or a link to this file).

---

### Customer auth – integration guide

Customer, vendor, and driver each have **separate auth routes** (customer: `/auth/customer`, vendor: `/auth/vendor`, driver: TBD).

**1. Customer login / register (send-otp + verify-otp)**

- **Send OTP**: `POST /api/v1/auth/customer/send-otp`  
  Body: `{ "phone": "+49..." }`  
  Rate limit: 5 per hour per phone. In dev, response may include `otp` (e.g. `1234`).
- **Verify OTP**: `POST /api/v1/auth/customer/verify-otp`  
  Body: `{ "phone": "+49...", "otp": "1234" }`  
  If the phone is not in the DB, a customer (User) is created; then JWT is returned.

Response (200) from verify-otp contains:

- `user` – profile (no password)
- `accessToken` – use for all protected API calls
- `refreshToken` – store securely (e.g. Keychain / Keystore); **do not** put in headers for normal requests
- `expiresIn` – access token TTL in seconds (e.g. `"900"` for 15 min)

**2. Calling protected APIs**

- Send the **access token** in every request:
  - Header: `Authorization: Bearer <accessToken>`
- Do **not** send the refresh token on these calls.

**3. When the access token expires**

- You will get **401 Unauthorized** on a protected endpoint.
- Then call **refresh** to get a new pair:
  - `POST /api/v1/auth/customer/refresh`
  - Header: `Content-Type: application/json`
  - Body: `{ "refreshToken": "<stored_refresh_token>" }`
- Response (200): `{ "accessToken", "refreshToken", "expiresIn" }`.
- **Important**: Replace the stored access and refresh tokens with the new ones. The old refresh token is invalid after use (rotation).

**4. Logout**

- `POST /api/v1/auth/customer/logout`  
  Body: `{ "refreshToken": "<stored_refresh_token>" }` (optional but recommended so the server can invalidate that token).
- Then delete access and refresh tokens from the device.

**5. Errors**

- **401** with body like `REFRESH_TOKEN_EXPIRED` or `INVALID_REFRESH_TOKEN`: refresh token is invalid or already used. User must log in again.
- **403** e.g. `PENDING_APPROVAL` / `REJECTED`: driver not yet approved or rejected.

**6. Security (for the app)**

- Store refresh token in **secure storage** (e.g. Keychain on iOS, Keystore on Android).
- Do not log or expose access/refresh tokens.
- Use HTTPS only.

**7. Optional: proactive refresh**

- You can refresh **before** the access token expires (e.g. when `expiresIn` is under 2 minutes) so the user rarely sees 401s. Always use the **latest** refresh token you received and replace it with the one returned from `/auth/customer/refresh`.
