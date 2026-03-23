# Run seeds (DeliverEats API)

**Requirement:** MongoDB running and `MONGO_URI` set in `apps/api/.env.development`.

---

## From repo root

```bash
cd /home/gt5682/Desktop/Salman/delivereats/apps/api
pnpm seed
```

If `pnpm` is not found, load nvm first:

```bash
source "$HOME/.nvm/nvm.sh"
cd /home/gt5682/Desktop/Salman/delivereats/apps/api
pnpm seed
```

---

## All seed commands (run from `apps/api`)

| Command | What it does |
|--------|----------------|
| `pnpm seed` or `pnpm seed:admin` | Seed default admin (admin@delivereats.com / Admin@123!) |
| `pnpm seed:categories` | Seed 5 food categories (Burgers, Pizza, Sushi, Salads, Drinks) |
| `pnpm seed:all` | Run admin seed then category seed |

---

## One-liners (copy-paste)

**Admin only:**
```bash
cd /home/gt5682/Desktop/Salman/delivereats/apps/api && pnpm seed
```

**Admin + categories:**
```bash
cd /home/gt5682/Desktop/Salman/delivereats/apps/api && pnpm seed:all
```

**Using npx (no pnpm):**
```bash
cd /home/gt5682/Desktop/Salman/delivereats/apps/api && npx ts-node src/seeders/adminSeeder.ts
```

---

## If seed “does nothing”

1. **MongoDB not running** – start MongoDB. If `MONGO_URI` is empty, the script prints: `MONGO_URI not set — skipping admin seed`.
2. **Wrong directory** – always run from `apps/api` so `.env.development` is loaded.
3. **Admin already exists** – script is idempotent; it will print `Default admin already exists` and exit.
