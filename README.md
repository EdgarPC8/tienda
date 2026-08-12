# Store (Raptor)

App Store basada en la plantilla EdDeli.

- **Backend:** `backend/` — API `storeapi`, BD `store`, puerto `3003`
- **Frontend (dev):** compartido en **`raptor/frontend`** (no se duplica):

```bash
# Terminal 1 — API Store
cd store/backend && npm run dev

# Terminal 2 — UI compartida apuntando a Store
cd raptor/frontend && npm run store
# → http://localhost:5174/store/  · proxy → storeapi:3003
```

Para EdDeli: `cd raptor/frontend && npm run eddeli` (puerto 5173 → eddeliapi:3001).

Los envs están en `raptor/frontend/.env.eddeli` y `raptor/frontend/.env.store`.

## Arranque backend

BD propia (`store`), no comparte datos con EdDeli (`softed`). Seed mínimo: roles + usuario Edgar + cuenta. Catálogo tienda (categorías + productos): `npm run seed:catalog`.

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS store CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cp backend/.env.example backend/.env
cd backend && npm install && npm run db:sync && npm run seed && npm run seed:catalog && npm run dev
# Login: administrador / 12345678
```

El JSON versionado del catálogo está en `backend/src/database/catalog-tienda.json` (23 categorías, 341 productos).

Si quedó un proceso viejo en el **3002** (puerto anterior):

```bash
fuser -k 3002/tcp
```

`npm run db:reset` en Store usa `backup.json` si existe; si no, aplica el **seed mínimo** (no copies el backup enorme de EdDeli).

## Sync desde EdDeli

Cuando cambies lógica compartida en `eddeli/backend`, reflejala en Store:

```bash
cd store/backend && npm run sync:from-eddeli
```

Eso **no** pisa identidad Store (`.env`, puerto, `storeapi`, BD, `seed.js`, AppSettings Raptor sin configurar, `reset-database.js`).

## Entitlement (gestor Raptor)

`PUT /storeapi/subscription/entitlement` con `GESTOR_SYNC_SECRET` (= `Apps.entitlement_secret` en el gestor).

URL local típica: `http://127.0.0.1:3003/storeapi/subscription/entitlement`
