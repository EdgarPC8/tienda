# Cobranzas: grupos de ítems — Cómo funciona

Este documento describe cómo se crean, guardan y gestionan los **grupos de ítems** en el módulo de Cobranzas (workbench): requests del frontend, rutas y controladores del backend, y modelos en BD.

---

## 1. Modelos en la base de datos

**Archivo:** `src/models/Finance.js`

### `ItemGroup` (tabla `ERP_finance_item_groups`)

| Campo        | Tipo     | Descripción                          |
|-------------|----------|--------------------------------------|
| id          | INTEGER  | PK, autoIncrement                    |
| customerId  | INTEGER  | Cliente dueño del grupo              |
| concept     | STRING   | Nombre/nota del grupo                |
| status      | ENUM     | `"open"` \| `"closed"` \| `"cancelled"` |
| totalAmount | DECIMAL  | Opcional; snapshot del total al crear |
| createdBy   | INTEGER  | Usuario que creó el grupo            |

### `ItemGroupItem` (tabla `ERP_finance_item_group_items`)

Tabla puente: qué ítem de pedido pertenece a qué grupo.

| Campo       | Tipo    | Descripción      |
|------------|---------|------------------|
| id         | INTEGER | PK               |
| groupId    | INTEGER | FK → ItemGroup   |
| orderItemId| INTEGER | FK → OrderItem   |

- Un `OrderItem` solo puede estar en un grupo (lógica de negocio en controlador).
- `onDelete: "CASCADE"` en ItemGroup → al borrar el grupo se borran sus ItemGroupItem.

### `Payment` (tabla `ERP_finance_payments`)

Cada abono a un grupo es un registro aquí. Luego se sincroniza con `Income` (contabilidad).

| Campo     | Tipo    | Descripción        |
|----------|---------|--------------------|
| id       | INTEGER | PK                 |
| customerId | INTEGER | Cliente            |
| groupId  | INTEGER | Grupo al que se abona |
| date     | DATEONLY| Fecha del abono    |
| amount   | DECIMAL | Monto              |
| method   | STRING  | ej. "efectivo"     |
| note     | STRING  | Observación        |
| status   | ENUM    | "completed" \| "cancelled" |
| createdBy | INTEGER | Usuario            |

- Cada Payment tiene un Income asociado con `referenceType: "group_payment"` y `referenceId: payment.id`.

---

## 2. Rutas (backend)

**Archivo:** `src/routes/OrderRoutes.js`  
Prefijo base: `/orders` (según cómo monte la app las rutas).

| Método | Ruta | Controlador | Descripción |
|--------|------|-------------|-------------|
| GET    | `/workbench/all` | getFinanceWorkbenchAll | Carga clientes, pedidos, grupos, pagos y enriquece ítems con `itemGroupId` |
| POST   | `/workbench/item-groups` | createItemGroup | Crear grupo con ítems |
| PUT    | `/workbench/item-groups/:groupId` | updateItemGroup | Editar concepto o status del grupo |
| DELETE | `/workbench/item-groups/:groupId` | deleteItemGroup | Eliminar grupo completo (solo si no tiene abonos) |
| POST   | `/workbench/item-groups/move-item` | moveItemBetweenGroups | Mover ítem a otro grupo o sacarlo (toGroupId = null) |
| POST   | `/workbench/item-groups/:groupId/pay` | payItemGroup | Registrar abono; crea Payment + Income y puede cerrar el grupo |
| PUT    | `/workbench/payments/:paymentId` | updateGroupPayment | Editar un pago y sincronizar Income |
| DELETE | `/workbench/payments/:paymentId` | deleteGroupPayment | Borrar pago y su Income |

Todas llevan `isAuthenticated`.

---

## 3. Requests del frontend

**Archivo (frontend):** `src/api/ordersRequest.js`

| Función | Método y ruta | Body / params |
|---------|----------------|----------------|
| getFinanceWorkbenchAllRequest() | GET `/orders/workbench/all` | — |
| createItemGroupRequest(data) | POST `/orders/workbench/item-groups` | `{ customerId, itemIds: number[], concept? }` |
| updateItemGroupRequest(groupId, data) | PUT `/orders/workbench/item-groups/:groupId` | `{ concept?, status? }` |
| deleteItemGroupRequest(groupId) | DELETE `/orders/workbench/item-groups/:groupId` | — |
| moveItemBetweenGroupsRequest(data) | POST `/orders/workbench/item-groups/move-item` | `{ orderItemId, toGroupId }` — `toGroupId: null` = sacar del grupo |
| payItemGroupRequest(groupId, data) | POST `/orders/workbench/item-groups/:groupId/pay` | `{ amount, date?, note?, method? }` |

Importante:
- **Sacar ítem del grupo:** usar `moveItemBetweenGroupsRequest({ orderItemId: item.id, toGroupId: null })`, no `deleteItemGroupRequest` (ese borra el grupo entero).
- **Mover ítem a otro grupo:** `moveItemBetweenGroupsRequest({ orderItemId, toGroupId })` con el ID del grupo destino.

---

## 4. Flujo de los controladores (resumen)

**Archivo:** `src/controllers/InventoryControl/OrderGroupFinanceController.js`

### createItemGroup

1. Recibe `customerId`, `itemIds[]`, `concept` (opcional).
2. Valida que los ítems existan y pertenezcan a pedidos de ese cliente.
3. Comprueba que ningún ítem esté ya en otro grupo (`ItemGroupItem`).
4. Calcula un total snapshot (qty × price) de los ítems.
5. Crea un registro en `ItemGroup` (status `"open"`).
6. Crea los enlaces en `ItemGroupItem` (groupId + orderItemId).
7. Devuelve el grupo creado y los itemIds agregados.

### getFinanceWorkbenchAll

1. Carga clientes con pedidos e ítems (y producto).
2. Carga todos los `ItemGroup` y `ItemGroupItem`.
3. Arma un mapa `orderItemId → groupId` y marca ítems con `inGroup` y `itemGroupId`.
4. Carga pagos de grupos.
5. Calcula por grupo: total (según ítems), abonado, saldo.
6. Calcula deuda por cliente: saldo de grupos abiertos + ítems pendientes no agrupados.
7. Devuelve `{ customers, orders, groups, payments }` con ítems enriquecidos con `itemGroupId` para el frontend.

### payItemGroup

1. Valida monto > 0.
2. Obtiene el grupo y sus ítems (OrderItem).
3. Calcula total cobrable (quantity - damagedQty - giftQty) × price y saldo restante.
4. Si el saldo ya es 0 (p. ej. por cambios), cierra el grupo y marca ítems como pagados sin crear pago.
5. Si hay abono: valida que no exceda el saldo, crea `Payment` y su `Income` (referenceType `"group_payment"`).
6. Si tras el abono el saldo queda en 0, pone el grupo en `status: "closed"` y marca los ítems con `paidAt`.

### moveItemBetweenGroups

1. Recibe `orderItemId` y `toGroupId` (puede ser `null`).
2. Si `toGroupId === null`: borra el `ItemGroupItem` correspondiente (sacar del grupo).
3. Si `toGroupId` es un ID: valida que el grupo exista y esté abierto; si el ítem ya estaba en un grupo, actualiza su `groupId`; si no, crea un nuevo `ItemGroupItem`.

### deleteItemGroup

1. Solo permite borrar si el grupo no tiene pagos (count de Payment con status completed === 0).
2. Borra todos los `ItemGroupItem` del grupo y luego el `ItemGroup`.

### updateItemGroup

1. Actualiza `concept` y/o `status` del grupo.

---

## 5. Resumen rápido

- **Crear grupo:** POST con `customerId` + `itemIds[]` → se crea `ItemGroup` y N `ItemGroupItem`.
- **Guardar en BD:** grupos en `ERP_finance_item_groups`, enlaces en `ERP_finance_item_group_items`, abonos en `ERP_finance_payments` (y su reflejo en Income).
- **Sacar ítem del grupo:** POST move-item con `toGroupId: null`.
- **Mover ítem a otro grupo:** POST move-item con `toGroupId` = ID del grupo destino.
- **Abonar:** POST pay al grupo → crea Payment + Income y puede cerrar el grupo y marcar ítems como pagados.
- **Eliminar grupo entero:** DELETE al grupo; solo si no tiene abonos.
