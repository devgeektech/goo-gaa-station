# Testing Socket.IO in DeliverEats API

The API uses **Socket.IO** on the same HTTP server (same port as the REST API). CORS is set via `CLIENT_ORIGIN` (default `http://localhost:3000`).

## 1. Quick check: server logs

1. Start the API: `pnpm dev` (or `npm run dev`) from `apps/api`.
2. When a client connects, the server logs:
   - `Client connected: <socket.id>`
3. When the client disconnects:
   - `Client disconnected: <socket.id>`

So the first test is: run a client that connects to the Socket.IO server and confirm these two lines appear in the API terminal.

---

## 2. Test with a Node script (recommended)

From the **monorepo root** or `apps/api`:

```bash
npx -y socket.io-client@4 http://localhost:5000
```

That opens an interactive Socket.IO REPL. You should see the connection and the server should log `Client connected: ...`. Type `disconnect` or Ctrl+C to disconnect and see `Client disconnected`.

Or use the built-in test script (uses `socket.io-client` from devDependencies):

```bash
cd apps/api
pnpm install   # if you just added the repo (installs socket.io-client)
pnpm run test:socket
```

Expected: `OK – Socket connected. id: ...` and in the **API terminal** `Client connected: <id>`. The script exits after 3 seconds.

---

## 3. Test from the browser (admin or app on allowed origin)

If your admin app runs at `http://localhost:3000` (or whatever `CLIENT_ORIGIN` is), open DevTools → Console and run:

```javascript
const io = (window.io || (await import('https://cdn.socket.io/4.7.2/socket.io.min.js')).io);
const socket = io('http://localhost:5000', { withCredentials: true });
socket.on('connect', () => console.log('Socket connected', socket.id));
socket.on('connect_error', (e) => console.error('Socket error', e.message));
```

You should see `Socket connected <id>` and the API should log `Client connected: ...`.

If the front end is on another origin, that origin must be allowed in the API’s Socket.IO `cors.origin` (e.g. set `CLIENT_ORIGIN` to that URL).

---

## 4. Events the server emits (for deeper testing)

The server emits to **rooms**; clients must join the right room to receive events (if you add a `join` handler on the server). Current usage:

| Event | Room | When |
|-------|------|------|
| `order:new` | `admin` | New order placed |
| `order:cancelled` | `admin` | Order cancelled |
| `order:payment_confirmed` | `admin` | Payment confirmed |
| `order:driver_assigned` | `customer:<customerId>` | Driver assigned to order |
| `order:status_update` | `customer:<customerId>` | Order status changed |
| `order:delivered` | `customer:<customerId>` | Order delivered |
| `payment:confirmed` | `customer:<customerId>` | Payment success |
| `payment:failed` | `customer:<customerId>` | Payment failed |
| `driver:online_status` | `admin` | Driver online/offline |
| `admin:driver_location` | `admin` | Driver location update |
| `driver:location_update` | `order:<orderId>` | Driver location for that order |

So “socket is working” means: a client can **connect** and the server logs connection/disconnection. To test **events**, the client must join the appropriate room (if your server exposes a `join` event) and then trigger the HTTP action (e.g. place order, update status) that causes the emit.

---

## 5. CORS / connection refused

- **Connection refused**: Ensure the API is running and the URL (e.g. `http://localhost:5000`) and port are correct.
- **CORS / 403**: Socket.IO uses `CLIENT_ORIGIN`. For a Node script, you can set `CLIENT_ORIGIN=*` temporarily or add the origin you’re testing from. For browser, the page origin must match `CLIENT_ORIGIN`.
