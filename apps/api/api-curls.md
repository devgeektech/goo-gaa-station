# DeliverEats API – cURL commands

Base URL: `http://localhost:5000`

---

## Health & Info

```bash
# Health check
curl -s http://localhost:5000/api/health

# API v1 welcome
curl -s http://localhost:5000/api/v1
```

---

## Auth – Admin (uses cookies)

```bash
# Admin login (saves cookies to cookie-jar.txt)
curl -s -c cookie-jar.txt -X POST http://localhost:5000/api/v1/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@delivereats.com","password":"Admin@123!"}'

# Admin refresh (send cookies)
curl -s -b cookie-jar.txt -X POST http://localhost:5000/api/v1/auth/admin/refresh

# Admin logout
curl -s -b cookie-jar.txt -X POST http://localhost:5000/api/v1/auth/admin/logout
```

---

## Auth – Customer (phone OTP; tokens in body)

```bash
# Send OTP
curl -s -X POST http://localhost:5000/api/v1/auth/customer/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+252618889456"}'

# Verify OTP (returns user, accessToken, refreshToken; in dev use otp from send-otp response, e.g. 1234)
curl -s -X POST http://localhost:5000/api/v1/auth/customer/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+252618889456","otp":"1234"}'

# Refresh (replace YOUR_REFRESH_TOKEN with token from verify-otp response)
curl -s -X POST http://localhost:5000/api/v1/auth/customer/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'

# Logout
curl -s -X POST http://localhost:5000/api/v1/auth/customer/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

---

## Protected request (Bearer token)

After app verify-otp, use the returned `accessToken` in the header:

```bash
curl -s http://localhost:5000/api/v1/some-protected-route \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
