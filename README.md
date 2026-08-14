# Tienda (Raptor)

- **Backend:** `backend/` — API `tiendaapi`, base `tienda`
- **Frontend (desarrollo):** compartido en `AppsWeb/raptor/frontend`
- **Puertos:** local `3004`; producción detrás de Apache, normalmente `3006`

## Desarrollo

```bash
# Terminal 1 — API Tienda
cd AppsWeb/tienda/backend
npm run dev

# Terminal 2 — interfaz compartida
cd AppsWeb/raptor/frontend
npm run dev:tienda
# http://localhost:5176/tienda/ · proxy → tiendaapi:3004
```

## Configuración con el gestor

Tienda usa el mismo mecanismo de entitlement que Store. En
`backend/.env` del servidor configurá su propia identidad:

```env
PORT=3006
API_PREFIX=tiendaapi
SUBSCRIPTION_API_URL=https://aplicaciones.marianosamaniego.edu.ec/raptorsolutions/api
GESTOR_SYNC_SECRET=<secreto-de-la-app-tienda-en-el-gestor>
```

`GESTOR_SYNC_SECRET` debe coincidir exactamente con
`Apps.entitlement_secret` de **Tienda** en el gestor. En el gestor, el destino
de sincronización de Tienda debe ser:

```text
https://aplicaciones.marianosamaniego.edu.ec/tiendaapi/subscription/entitlement
```

No reutilices el secreto ni la URL de Store: Store usa `storeapi` y su propio
secreto. El archivo `backend/.env` es local al servidor y nunca se sube a Git.

## Git y despliegue

Desde el equipo de desarrollo:

```bash
cd AppsWeb/raptor/frontend
npm run git-push-tienda -- "descripción del cambio"
```

Para publicar EdDeli, Store y Tienda de una sola vez:

```bash
npm run git-push-apps -- "cambio compartido"
```

El repositorio de despliegue de Tienda usa la rama `master`. En el servidor:

```bash
cd /var/www/html/tienda
git status
git checkout master
git pull origin master
```

Antes de cambiar de rama o hacer `git pull`, `git status` debe estar limpio.
Si el servidor tiene cambios locales que necesitás conservar, guardalos primero:

```bash
git stash push -u -m "configuración local antes de actualizar Tienda"
```

No se deben editar archivos versionados del backend directamente en el
servidor. La configuración se mantiene en `backend/.env`; backups, imágenes,
logs y archivos `.bak` están ignorados.
