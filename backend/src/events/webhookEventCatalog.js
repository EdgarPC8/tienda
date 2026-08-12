/**
 * Catálogo de eventos webhook → Raptor Solutions.
 * Resuelve type_key + name a partir de método HTTP y ruta.
 */

const SENSITIVE_KEYS = new Set([
  "password",
  "newPassword",
  "confirmPassword",
  "oldPassword",
  "token",
  "authorization",
]);

const RESOURCE_EVENT_PREFIX = {
  users: "user",
  user: "user",
  account: "account",
  accounts: "account",
  rol: "role",
  roles: "role",
  orders: "order",
  order: "order",
  "order-items": "order_item",
  customers: "customer",
  customer: "customer",
  suppliers: "supplier",
  supplier: "supplier",
  "supplier-orders": "supplier_order",
  products: "product",
  product: "product",
  categories: "category",
  category: "category",
  units: "unit",
  unit: "unit",
  stores: "store",
  store: "store",
  movements: "movement",
  movement: "movement",
  recipes: "recipe",
  recipe: "recipe",
  catalog: "catalog_entry",
  "compare-groups": "compare_group",
  "tier-groups": "tier_group",
  homeproducts: "home_product",
  "generic-ingredients": "generic_ingredient",
  presentations: "presentation",
  incomes: "income",
  income: "income",
  expenses: "expense",
  expense: "expense",
  obligations: "obligation",
  obligation: "obligation",
  recurring: "recurring",
  shifts: "shift",
  shift: "shift",
  tasks: "task",
  plans: "task_plan",
  items: "task_item",
  notifications: "notification",
  "notification-programs": "notification_program",
  publicidad: "publicidad",
  devices: "publicidad_device",
  campaigns: "publicidad_campaign",
  media: "media",
  documents: "document",
  document: "document",
  img: "image",
  files: "file",
  file: "file",
  sri: "sri",
  settings: "app",
  app: "app",
  subscription: "subscription",
  comands: "backup",
  backups: "backup",
  logs: "log",
  license: "license",
  editor: "editor",
  templates: "editor_template",
  designs: "editor_design",
  login: "auth",
  changeRole: "auth",
  workbench: "workbench",
  "item-groups": "item_group",
  payments: "workbench_payment",
  "supplier-payables": "supplier_payable",
};

const METHOD_SUFFIX = {
  POST: "created",
  PUT: "updated",
  PATCH: "updated",
  DELETE: "deleted",
};

/**
 * Reglas explícitas (prioridad sobre fallback).
 * name puede ser string fijo o función (req, responseBody) => string
 */
const EXPLICIT_RULES = [
  { method: "POST", pattern: /^\/login\/?$/, type_key: "auth.login", name: "Inicio de sesión" },
  { method: "POST", pattern: /^\/changeRole\/?$/, type_key: "auth.role_changed", name: "Cambio de rol" },

  { method: "POST", pattern: /^\/users\/?$/, type_key: "user.created", name: (req) => nameWithEntity("Usuario", req, "user") },
  { method: "POST", pattern: /^\/users\/bulk\/?$/, type_key: "user.bulk_created", name: "Usuarios creados en lote" },
  { method: "PUT", pattern: /^\/users\/\d+\/?$/, type_key: "user.updated", name: (req) => nameWithEntity("Usuario", req, "userId") },
  { method: "DELETE", pattern: /^\/users\/\d+\/?$/, type_key: "user.deleted", name: (req) => nameWithEntity("Usuario", req, "userId") },
  { method: "PUT", pattern: /^\/users\/photo\/\d+\/?$/, type_key: "user.photo_uploaded", name: (req) => nameWithEntity("Foto usuario", req, "userId") },
  { method: "DELETE", pattern: /^\/users\/photo\/\d+\/?$/, type_key: "user.photo_deleted", name: (req) => nameWithEntity("Foto usuario", req, "userId") },
  { method: "PUT", pattern: /^\/users\/me\/data\/?$/, type_key: "user.data_updated", name: "Datos personales actualizados" },

  { method: "POST", pattern: /^\/account\/?$/, type_key: "account.created", name: "Cuenta creada" },
  { method: "PUT", pattern: /^\/account\/\d+\/?$/, type_key: "account.updated", name: (req) => nameWithEntity("Cuenta", req, "id") },
  { method: "DELETE", pattern: /^\/account\/\d+\/?$/, type_key: "account.deleted", name: (req) => nameWithEntity("Cuenta", req, "id") },
  { method: "PUT", pattern: /^\/account\/resetPassword\/\d+\/?$/, type_key: "account.password_reset", name: (req) => nameWithEntity("Reset contraseña cuenta", req, "id") },
  { method: "PUT", pattern: /^\/account\/updateAccountUser\//, type_key: "account.user_updated", name: "Cuenta y usuario actualizados" },
  { method: "POST", pattern: /^\/rol\/?$/, type_key: "role.created", name: "Rol creado" },
  { method: "PUT", pattern: /^\/rol\/\d+\/?$/, type_key: "role.updated", name: (req) => nameWithEntity("Rol", req, "id") },
  { method: "DELETE", pattern: /^\/rol\/\d+\/?$/, type_key: "role.deleted", name: (req) => nameWithEntity("Rol", req, "id") },

  { method: "POST", pattern: /^\/orders\/?$/, type_key: "order.created", name: (req, body) => orderName(body) },
  { method: "PUT", pattern: /^\/orders\/\d+\/?$/, type_key: "order.updated", name: (req) => nameWithEntity("Pedido", req, "id") },
  { method: "DELETE", pattern: /^\/orders\/order\/\d+\/?$/, type_key: "order.deleted", name: (req) => nameWithEntity("Pedido", req, "id") },
  { method: "PUT", pattern: /^\/orders\/\d+\/status\/?$/, type_key: "order.status_changed", name: (req) => nameWithEntity("Estado pedido", req, "id") },
  { method: "PUT", pattern: /^\/orders\/\d+\/mark-paid\/?$/, type_key: "order.mark_paid", name: (req) => nameWithEntity("Pedido pagado", req, "id") },
  { method: "POST", pattern: /^\/orders\/pos\/checkout\/?$/, type_key: "order.pos_checkout", name: "Cobro en caja POS" },
  { method: "POST", pattern: /^\/orders\/\d+\/items\/?$/, type_key: "order_item.created", name: (req) => nameWithEntity("Ítem pedido", req, "orderId") },
  { method: "PUT", pattern: /^\/orders\/order-items\/\d+\/?$/, type_key: "order_item.updated", name: (req) => nameWithEntity("Ítem pedido", req, "itemId") },
  { method: "DELETE", pattern: /^\/orders\/order-items\/\d+\/?$/, type_key: "order_item.deleted", name: (req) => nameWithEntity("Ítem pedido", req, "id") },
  { method: "PUT", pattern: /^\/orders\/order-items\/\d+\/mark-delivered\/?$/, type_key: "order_item.mark_delivered", name: (req) => nameWithEntity("Ítem entregado", req, "itemId") },
  { method: "PUT", pattern: /^\/orders\/order-items\/\d+\/mark-paid\/?$/, type_key: "order_item.mark_paid", name: (req) => nameWithEntity("Ítem pagado", req, "itemId") },
  { method: "PUT", pattern: /^\/orders\/order-items\/\d+\/programmer-dashboard\/?$/, type_key: "order_item.programmer_corrected", name: (req) => nameWithEntity("Corrección ítem", req, "itemId") },
  { method: "PATCH", pattern: /^\/orders\/order-items\/\d+\/programmer-dashboard\/?$/, type_key: "order_item.programmer_corrected", name: (req) => nameWithEntity("Corrección ítem", req, "itemId") },

  { method: "GET", pattern: /^\/orders\/month-transfer\/export\/?$/, type_key: "orders.month_exported", name: "Export pedidos del mes" },
  { method: "POST", pattern: /^\/orders\/month-transfer\/import\/?$/, type_key: "orders.month_imported", name: "Import pedidos del mes" },

  { method: "POST", pattern: /^\/orders\/customers\/?$/, type_key: "customer.created", name: "Cliente creado" },
  { method: "PUT", pattern: /^\/orders\/customers\/\d+\/?$/, type_key: "customer.updated", name: (req) => nameWithEntity("Cliente", req, "id") },
  { method: "DELETE", pattern: /^\/orders\/customers\/\d+\/?$/, type_key: "customer.deleted", name: (req) => nameWithEntity("Cliente", req, "id") },
  { method: "POST", pattern: /^\/orders\/suppliers\/?$/, type_key: "supplier.created", name: "Proveedor creado" },
  { method: "PUT", pattern: /^\/orders\/suppliers\/\d+\/?$/, type_key: "supplier.updated", name: (req) => nameWithEntity("Proveedor", req, "id") },
  { method: "DELETE", pattern: /^\/orders\/suppliers\/\d+\/?$/, type_key: "supplier.deleted", name: (req) => nameWithEntity("Proveedor", req, "id") },

  { method: "POST", pattern: /^\/orders\/supplier-orders\/?$/, type_key: "supplier_order.created", name: "Pedido a proveedor creado" },
  { method: "PUT", pattern: /^\/orders\/supplier-orders\/\d+\/?$/, type_key: "supplier_order.updated", name: (req) => nameWithEntity("Pedido proveedor", req, "id") },
  { method: "DELETE", pattern: /^\/orders\/supplier-orders\/\d+\/?$/, type_key: "supplier_order.deleted", name: (req) => nameWithEntity("Pedido proveedor", req, "id") },
  { method: "POST", pattern: /^\/orders\/supplier-orders\/\d+\/items\/?$/, type_key: "supplier_order.item_added", name: (req) => nameWithEntity("Ítem pedido proveedor", req, "id") },
  { method: "PUT", pattern: /^\/orders\/supplier-orders\/\d+\/received\/?$/, type_key: "supplier_order.mark_received", name: (req) => nameWithEntity("Pedido recibido", req, "id") },
  { method: "PUT", pattern: /^\/orders\/supplier-orders\/\d+\/paid\/?$/, type_key: "supplier_order.mark_paid", name: (req) => nameWithEntity("Pedido proveedor pagado", req, "id") },
  { method: "POST", pattern: /^\/orders\/supplier-payables\/orders\/\d+\/pay\/?$/, type_key: "supplier_payable.paid", name: (req) => nameWithEntity("Abono proveedor", req, "orderId") },
  { method: "PUT", pattern: /^\/orders\/supplier-payables\/payments\/\d+\/?$/, type_key: "supplier_payable.payment_updated", name: (req) => nameWithEntity("Abono proveedor", req, "paymentId") },
  { method: "DELETE", pattern: /^\/orders\/supplier-payables\/payments\/\d+\/?$/, type_key: "supplier_payable.payment_deleted", name: (req) => nameWithEntity("Abono proveedor", req, "paymentId") },

  { method: "POST", pattern: /^\/orders\/workbench\/orders\/\d+\/pay\/?$/, type_key: "workbench.order_paid", name: (req) => nameWithEntity("Cobro pedido", req, "orderId") },
  { method: "POST", pattern: /^\/orders\/workbench\/item-groups\/?$/, type_key: "item_group.created", name: "Grupo de ítems creado" },
  { method: "PUT", pattern: /^\/orders\/workbench\/item-groups\/\d+\/?$/, type_key: "item_group.updated", name: (req) => nameWithEntity("Grupo ítems", req, "groupId") },
  { method: "DELETE", pattern: /^\/orders\/workbench\/item-groups\/\d+\/?$/, type_key: "item_group.deleted", name: (req) => nameWithEntity("Grupo ítems", req, "groupId") },
  { method: "POST", pattern: /^\/orders\/workbench\/item-groups\/\d+\/add-items\/?$/, type_key: "item_group.items_added", name: (req) => nameWithEntity("Ítems agregados al grupo", req, "groupId") },
  { method: "POST", pattern: /^\/orders\/workbench\/item-groups\/move-item\/?$/, type_key: "item_group.item_moved", name: "Ítem movido entre grupos" },
  { method: "POST", pattern: /^\/orders\/workbench\/item-groups\/\d+\/pay\/?$/, type_key: "item_group.paid", name: (req) => nameWithEntity("Abono grupo", req, "groupId") },
  { method: "PUT", pattern: /^\/orders\/workbench\/payments\/\d+\/?$/, type_key: "workbench_payment.updated", name: (req) => nameWithEntity("Pago workbench", req, "paymentId") },
  { method: "DELETE", pattern: /^\/orders\/workbench\/payments\/\d+\/?$/, type_key: "workbench_payment.deleted", name: (req) => nameWithEntity("Pago workbench", req, "paymentId") },

  { method: "POST", pattern: /^\/inventory\/products\/?$/, type_key: "product.created", name: "Producto creado" },
  { method: "PUT", pattern: /^\/inventory\/products\/\d+\/?$/, type_key: "product.updated", name: (req) => nameWithEntity("Producto", req, "id") },
  { method: "PATCH", pattern: /^\/inventory\/products\/\d+\/stock\/?$/, type_key: "product.stock_adjusted", name: (req) => nameWithEntity("Stock producto", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/products\/\d+\/?$/, type_key: "product.deleted", name: (req) => nameWithEntity("Producto", req, "id") },

  { method: "POST", pattern: /^\/inventory\/categories\/?$/, type_key: "category.created", name: "Categoría creada" },
  { method: "PUT", pattern: /^\/inventory\/categories\/\d+\/?$/, type_key: "category.updated", name: (req) => nameWithEntity("Categoría", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/categories\/\d+\/?$/, type_key: "category.deleted", name: (req) => nameWithEntity("Categoría", req, "id") },

  { method: "POST", pattern: /^\/inventory\/units\/?$/, type_key: "unit.created", name: "Unidad creada" },
  { method: "PUT", pattern: /^\/inventory\/units\/\d+\/?$/, type_key: "unit.updated", name: (req) => nameWithEntity("Unidad", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/units\/\d+\/?$/, type_key: "unit.deleted", name: (req) => nameWithEntity("Unidad", req, "id") },

  { method: "POST", pattern: /^\/inventory\/stores\/?$/, type_key: "store.created", name: "Local creado" },
  { method: "PUT", pattern: /^\/inventory\/stores\/\d+\/?$/, type_key: "store.updated", name: (req) => nameWithEntity("Local", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/stores\/\d+\/?$/, type_key: "store.deleted", name: (req) => nameWithEntity("Local", req, "id") },
  { method: "POST", pattern: /^\/inventory\/stores\/\d+\/products\/?$/, type_key: "store.product_assigned", name: (req) => nameWithEntity("Productos asignados al local", req, "storeId") },
  { method: "DELETE", pattern: /^\/inventory\/stores\/\d+\/products\/\d+\/?$/, type_key: "store.product_removed", name: (req) => nameWithEntity("Producto quitado del local", req, "storeId") },
  { method: "PATCH", pattern: /^\/inventory\/stores\/\d+\/products\/\d+\/?$/, type_key: "store.product_toggled", name: (req) => nameWithEntity("Toggle producto local", req, "storeId") },

  { method: "POST", pattern: /^\/inventory\/movements\/?$/, type_key: "movement.created", name: "Movimiento registrado" },
  { method: "POST", pattern: /^\/inventory\/movements\/batch\/?$/, type_key: "movement.batch_created", name: "Movimientos en lote" },
  { method: "POST", pattern: /^\/inventory\/movements\/open-presentation\/?$/, type_key: "movement.presentation_opened", name: "Presentación abierta" },
  { method: "PUT", pattern: /^\/inventory\/movements\/\d+\/?$/, type_key: "movement.updated", name: (req) => nameWithEntity("Movimiento", req, "movementId") },
  { method: "PUT", pattern: /^\/inventory\/movements\/batch\/date\/?$/, type_key: "movement.date_batch_updated", name: "Fechas de movimientos actualizadas" },
  { method: "DELETE", pattern: /^\/inventory\/movements\/\d+\/?$/, type_key: "movement.deleted", name: (req) => nameWithEntity("Movimiento", req, "movementId") },
  { method: "POST", pattern: /^\/inventory\/registerProductionIntermediateFromPayload\/?$/, type_key: "production.intermediate_registered", name: "Producción intermedia" },
  { method: "POST", pattern: /^\/inventory\/registerProductionFinalFromPayload\/?$/, type_key: "production.final_registered", name: "Producción final" },

  { method: "POST", pattern: /^\/inventory\/recipes\/?$/, type_key: "recipe.created", name: "Receta creada" },
  { method: "PUT", pattern: /^\/inventory\/recipes\/\d+\/?$/, type_key: "recipe.updated", name: (req) => nameWithEntity("Receta", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/recipes\/\d+\/?$/, type_key: "recipe.deleted", name: (req) => nameWithEntity("Receta", req, "id") },

  { method: "POST", pattern: /^\/inventory\/catalog\/?$/, type_key: "catalog_entry.created", name: "Entrada catálogo creada" },
  { method: "PUT", pattern: /^\/inventory\/catalog\/\d+\/?$/, type_key: "catalog_entry.updated", name: (req) => nameWithEntity("Catálogo", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/catalog\/\d+\/?$/, type_key: "catalog_entry.deleted", name: (req) => nameWithEntity("Catálogo", req, "id") },
  { method: "POST", pattern: /^\/inventory\/catalog\/reorder\/?$/, type_key: "catalog.reordered", name: "Catálogo reordenado" },

  { method: "POST", pattern: /^\/inventory\/compare-groups\/?$/, type_key: "compare_group.created", name: "Grupo comparación creado" },
  { method: "POST", pattern: /^\/inventory\/compare-groups\/bootstrap-pasteles\/?$/, type_key: "compare_group.pasteles_bootstrapped", name: "Bootstrap pasteles" },
  { method: "PUT", pattern: /^\/inventory\/compare-groups\/\d+\/?$/, type_key: "compare_group.updated", name: (req) => nameWithEntity("Grupo comparación", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/compare-groups\/\d+\/?$/, type_key: "compare_group.deleted", name: (req) => nameWithEntity("Grupo comparación", req, "id") },

  { method: "POST", pattern: /^\/inventory\/tier-groups\/?$/, type_key: "tier_group.created", name: "Grupo tramos creado" },
  { method: "POST", pattern: /^\/inventory\/tier-groups\/migrate-from-categories\/?$/, type_key: "tier_group.migrated_from_categories", name: "Migración tramos desde categorías" },
  { method: "PUT", pattern: /^\/inventory\/tier-groups\/\d+\/?$/, type_key: "tier_group.updated", name: (req) => nameWithEntity("Grupo tramos", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/tier-groups\/\d+\/?$/, type_key: "tier_group.deleted", name: (req) => nameWithEntity("Grupo tramos", req, "id") },

  { method: "POST", pattern: /^\/inventory\/homeproducts\/?$/, type_key: "home_product.created", name: "Producto destacado creado" },
  { method: "PUT", pattern: /^\/inventory\/homeproducts\/\d+\/?$/, type_key: "home_product.updated", name: (req) => nameWithEntity("Producto destacado", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/homeproducts\/\d+\/?$/, type_key: "home_product.deleted", name: (req) => nameWithEntity("Producto destacado", req, "id") },

  { method: "POST", pattern: /^\/inventory\/generic-ingredients\/?$/, type_key: "generic_ingredient.created", name: "Insumo genérico creado" },
  { method: "POST", pattern: /^\/inventory\/generic-ingredients\/bootstrap\/?$/, type_key: "generic_ingredient.bootstrapped", name: "Bootstrap insumos genéricos" },
  { method: "POST", pattern: /^\/inventory\/generic-ingredients\/\d+\/presentations\/?$/, type_key: "presentation.created", name: "Presentación creada" },
  { method: "PATCH", pattern: /^\/inventory\/generic-ingredients\/presentations\/\d+\/link\/?$/, type_key: "presentation.linked", name: (req) => nameWithEntity("Presentación vinculada", req, "productId") },
  { method: "PATCH", pattern: /^\/inventory\/generic-ingredients\/presentations\/\d+\/unlink\/?$/, type_key: "presentation.unlinked", name: (req) => nameWithEntity("Presentación desvinculada", req, "productId") },

  { method: "POST", pattern: /^\/inventory\/customers\/?$/, type_key: "customer.created", name: "Cliente creado" },
  { method: "PUT", pattern: /^\/inventory\/customers\/\d+\/?$/, type_key: "customer.updated", name: (req) => nameWithEntity("Cliente", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/customers\/\d+\/?$/, type_key: "customer.deleted", name: (req) => nameWithEntity("Cliente", req, "id") },
  { method: "POST", pattern: /^\/inventory\/suppliers\/?$/, type_key: "supplier.created", name: "Proveedor creado" },
  { method: "PUT", pattern: /^\/inventory\/suppliers\/\d+\/?$/, type_key: "supplier.updated", name: (req) => nameWithEntity("Proveedor", req, "id") },
  { method: "DELETE", pattern: /^\/inventory\/suppliers\/\d+\/?$/, type_key: "supplier.deleted", name: (req) => nameWithEntity("Proveedor", req, "id") },

  { method: "POST", pattern: /^\/finance\/incomes\/?$/, type_key: "income.created", name: "Ingreso creado" },
  { method: "PUT", pattern: /^\/finance\/incomes\/\d+\/?$/, type_key: "income.updated", name: (req) => nameWithEntity("Ingreso", req, "id") },
  { method: "DELETE", pattern: /^\/finance\/incomes\/\d+\/?$/, type_key: "income.deleted", name: (req) => nameWithEntity("Ingreso", req, "id") },
  { method: "POST", pattern: /^\/finance\/expenses\/?$/, type_key: "expense.created", name: "Gasto creado" },
  { method: "PUT", pattern: /^\/finance\/expenses\/\d+\/?$/, type_key: "expense.updated", name: (req) => nameWithEntity("Gasto", req, "id") },
  { method: "DELETE", pattern: /^\/finance\/expenses\/\d+\/?$/, type_key: "expense.deleted", name: (req) => nameWithEntity("Gasto", req, "id") },
  { method: "POST", pattern: /^\/finance\/obligations\/?$/, type_key: "obligation.created", name: "Obligación creada" },
  { method: "POST", pattern: /^\/finance\/obligations\/\d+\/pay\/?$/, type_key: "obligation.paid", name: (req) => nameWithEntity("Obligación pagada", req, "id") },
  { method: "PATCH", pattern: /^\/finance\/obligations\/\d+\/cancel\/?$/, type_key: "obligation.cancelled", name: (req) => nameWithEntity("Obligación cancelada", req, "id") },
  { method: "POST", pattern: /^\/finance\/recurring\/templates\/?$/, type_key: "recurring_template.created", name: "Plantilla recurrente creada" },
  { method: "PUT", pattern: /^\/finance\/recurring\/templates\/\d+\/?$/, type_key: "recurring_template.updated", name: (req) => nameWithEntity("Plantilla recurrente", req, "id") },
  { method: "POST", pattern: /^\/finance\/recurring\/generate\/?$/, type_key: "recurring.occurrences_generated", name: "Ocurrencias recurrentes generadas" },
  { method: "PATCH", pattern: /^\/finance\/recurring\/occurrences\/\d+\/?$/, type_key: "recurring_occurrence.updated", name: (req) => nameWithEntity("Ocurrencia recurrente", req, "id") },
  { method: "POST", pattern: /^\/finance\/recurring\/occurrences\/\d+\/pay\/?$/, type_key: "recurring_occurrence.paid", name: (req) => nameWithEntity("Ocurrencia pagada", req, "id") },
  { method: "PATCH", pattern: /^\/finance\/recurring\/occurrences\/\d+\/skip\/?$/, type_key: "recurring_occurrence.skipped", name: (req) => nameWithEntity("Ocurrencia omitida", req, "id") },

  { method: "POST", pattern: /^\/shifts\/open\/?$/, type_key: "shift.opened", name: "Turno abierto" },
  { method: "POST", pattern: /^\/shifts\/\d+\/close\/?$/, type_key: "shift.closed", name: (req) => nameWithEntity("Turno cerrado", req, "id") },
  { method: "PATCH", pattern: /^\/shifts\/\d+\/?$/, type_key: "shift.updated", name: (req) => nameWithEntity("Turno", req, "id") },
  { method: "POST", pattern: /^\/shifts\/\d+\/movements\/?$/, type_key: "shift_movement.created", name: (req) => nameWithEntity("Movimiento caja", req, "id") },
  { method: "PATCH", pattern: /^\/shifts\/\d+\/movements\/\d+\/?$/, type_key: "shift_movement.updated", name: (req) => nameWithEntity("Movimiento caja", req, "movementId") },
  { method: "DELETE", pattern: /^\/shifts\/\d+\/movements\/\d+\/?$/, type_key: "shift_movement.deleted", name: (req) => nameWithEntity("Movimiento caja", req, "movementId") },

  { method: "POST", pattern: /^\/tasks\/plans\/?$/, type_key: "task_plan.created", name: "Plan de tareas creado" },
  { method: "PUT", pattern: /^\/tasks\/plans\/\d+\/?$/, type_key: "task_plan.updated", name: (req) => nameWithEntity("Plan tareas", req, "id") },
  { method: "DELETE", pattern: /^\/tasks\/plans\/\d+\/?$/, type_key: "task_plan.deleted", name: (req) => nameWithEntity("Plan tareas", req, "id") },
  { method: "POST", pattern: /^\/tasks\/plans\/\d+\/publish\/?$/, type_key: "task_plan.published", name: (req) => nameWithEntity("Plan publicado", req, "id") },
  { method: "PUT", pattern: /^\/tasks\/items\/\d+\/status\/?$/, type_key: "task_item.status_updated", name: (req) => nameWithEntity("Estado tarea", req, "id") },
  { method: "DELETE", pattern: /^\/tasks\/items\/\d+\/?$/, type_key: "task_item.deleted", name: (req) => nameWithEntity("Tarea", req, "id") },
  { method: "POST", pattern: /^\/tasks\/items\/\d+\/execute-open-box\/?$/, type_key: "task_item.open_box_executed", name: (req) => nameWithEntity("Apertura caja tarea", req, "id") },

  { method: "POST", pattern: /^\/notifications\/?$/, type_key: "notification.created", name: "Notificación creada" },
  { method: "PUT", pattern: /^\/notifications\/seen\/\d+\/?$/, type_key: "notification.mark_seen", name: (req) => nameWithEntity("Notificación leída", req, "id") },
  { method: "PUT", pattern: /^\/notifications\/seen-all\//, type_key: "notification.mark_all_seen", name: "Todas las notificaciones leídas" },
  { method: "PUT", pattern: /^\/notifications\/bulk-seen\/?$/, type_key: "notification.mark_bulk_seen", name: "Notificaciones marcadas leídas" },
  { method: "DELETE", pattern: /^\/notifications\/bulk\/?$/, type_key: "notification.bulk_deleted", name: "Notificaciones eliminadas" },
  { method: "DELETE", pattern: /^\/notifications\/read\//, type_key: "notification.read_deleted", name: "Notificaciones leídas eliminadas" },
  { method: "DELETE", pattern: /^\/notifications\/\d+\/?$/, type_key: "notification.deleted", name: (req) => nameWithEntity("Notificación", req, "id") },

  { method: "POST", pattern: /^\/notification-programs\/?$/, type_key: "notification_program.created", name: "Programa notificación creado" },
  { method: "PUT", pattern: /^\/notification-programs\/\d+\/?$/, type_key: "notification_program.updated", name: (req) => nameWithEntity("Programa notificación", req, "id") },
  { method: "DELETE", pattern: /^\/notification-programs\/\d+\/?$/, type_key: "notification_program.deleted", name: (req) => nameWithEntity("Programa notificación", req, "id") },
  { method: "POST", pattern: /^\/notification-programs\/\d+\/send\/?$/, type_key: "notification_program.sent", name: (req) => nameWithEntity("Programa enviado", req, "id") },

  { method: "POST", pattern: /^\/publicidad\/devices\/register\/?$/, type_key: "publicidad_device.registered", name: "Dispositivo publicidad registrado" },
  { method: "PUT", pattern: /^\/publicidad\/devices\/[^/]+\/?$/, type_key: "publicidad_device.updated", name: (req) => nameWithEntity("Dispositivo", req, "deviceId") },
  { method: "DELETE", pattern: /^\/publicidad\/devices\/[^/]+\/?$/, type_key: "publicidad_device.deleted", name: (req) => nameWithEntity("Dispositivo", req, "deviceId") },
  { method: "POST", pattern: /^\/publicidad\/campaigns\/?$/, type_key: "publicidad_campaign.created", name: "Campaña creada" },
  { method: "PUT", pattern: /^\/publicidad\/campaigns\/\d+\/?$/, type_key: "publicidad_campaign.updated", name: (req) => nameWithEntity("Campaña", req, "id") },
  { method: "DELETE", pattern: /^\/publicidad\/campaigns\/\d+\/?$/, type_key: "publicidad_campaign.deleted", name: (req) => nameWithEntity("Campaña", req, "id") },

  { method: "POST", pattern: /^\/media\/upload\/?$/, type_key: "media.uploaded", name: "Medio subido" },
  { method: "DELETE", pattern: /^\/media\/\d+\/?$/, type_key: "media.deleted", name: (req) => nameWithEntity("Medio", req, "id") },

  { method: "POST", pattern: /^\/documents\/upload\/?$/, type_key: "document.uploaded", name: "Documento subido" },
  { method: "DELETE", pattern: /^\/documents\/\d+\/?$/, type_key: "document.deleted", name: (req) => nameWithEntity("Documento", req, "id") },

  { method: "POST", pattern: /^\/img\//, type_key: "image.uploaded", name: "Imagen subida" },
  { method: "DELETE", pattern: /^\/img\//, type_key: "image.deleted", name: "Imagen eliminada" },
  { method: "POST", pattern: /^\/files\//, type_key: "file.uploaded", name: "Archivo subido" },
  { method: "DELETE", pattern: /^\/files\//, type_key: "file.deleted", name: "Archivo eliminado" },

  { method: "POST", pattern: /^\/editor\/templates\/import\/?$/, type_key: "editor.template_imported", name: "Plantilla importada" },
  { method: "PUT", pattern: /^\/editor\/templates\/\d+\/?$/, type_key: "editor.template_updated", name: (req) => nameWithEntity("Plantilla", req, "id") },
  { method: "PUT", pattern: /^\/editor\/templates\/\d+\/doc\/?$/, type_key: "editor.template_doc_updated", name: (req) => nameWithEntity("Doc plantilla", req, "id") },
  { method: "DELETE", pattern: /^\/editor\/templates\/\d+\/?$/, type_key: "editor.template_deleted", name: (req) => nameWithEntity("Plantilla", req, "id") },
  { method: "POST", pattern: /^\/editor\/designs\/?$/, type_key: "editor.design_created", name: "Diseño creado" },
  { method: "PUT", pattern: /^\/editor\/designs\/\d+\/?$/, type_key: "editor.design_updated", name: (req) => nameWithEntity("Diseño", req, "id") },
  { method: "POST", pattern: /^\/editor\/designs\/\d+\/overrides\/?$/, type_key: "editor.override_upserted", name: (req) => nameWithEntity("Override diseño", req, "id") },

  { method: "PUT", pattern: /^\/sri\/settings\/?$/, type_key: "sri.settings_updated", name: "Configuración SRI actualizada" },
  { method: "POST", pattern: /^\/sri\/certificate\/?$/, type_key: "sri.certificate_uploaded", name: "Certificado SRI subido" },
  { method: "DELETE", pattern: /^\/sri\/certificate\/?$/, type_key: "sri.certificate_deleted", name: "Certificado SRI eliminado" },
  { method: "POST", pattern: /^\/sri\/invoices\/emit\/?$/, type_key: "sri.invoice.emitted", name: "Factura SRI emitida" },
  { method: "POST", pattern: /^\/sri\/invoices\/\d+\/refresh\/?$/, type_key: "sri.invoice.refreshed", name: (req) => nameWithEntity("Factura SRI consultada", req, "id") },

  { method: "PUT", pattern: /^\/app\/settings\/?$/, type_key: "app.settings_updated", name: "Configuración app actualizada" },
  { method: "PUT", pattern: /^\/subscription\/entitlement\/?$/, type_key: "subscription.entitlement_updated", name: "Entitlement actualizado" },
  { method: "POST", pattern: /^\/subscription\/pull\/?$/, type_key: "subscription.pulled", name: "Suscripción sincronizada" },

  { method: "GET", pattern: /^\/comands\/saveBackup\/?$/, type_key: "backup.saved", name: "Backup guardado" },
  { method: "GET", pattern: /^\/comands\/reloadBD\/?$/, type_key: "database.reloaded", name: "Base de datos recargada" },
  { method: "POST", pattern: /^\/comands\/upload-backup\/?$/, type_key: "backup.uploaded", name: "Backup subido" },
  { method: "POST", pattern: /^\/comands\/backups\/stored\/[^/]+\/set-main\/?$/, type_key: "backup.set_main", name: "Backup principal establecido" },
  { method: "DELETE", pattern: /^\/comands\/backups\/stored\/[^/]+\/?$/, type_key: "backup.stored_deleted", name: "Backup almacenado eliminado" },
  { method: "POST", pattern: /^\/comands\/backups\/stored\/prune-and-save\/?$/, type_key: "backup.pruned", name: "Backups podados" },
  { method: "DELETE", pattern: /^\/comands\/logs\/?$/, type_key: "log.deleted", name: "Logs eliminados" },
  { method: "DELETE", pattern: /^\/comands\/logs\/\d+\/?$/, type_key: "log.entry_deleted", name: (req) => nameWithEntity("Log", req, "id") },

  { method: "POST", pattern: /^\/addLicense\/?$/, type_key: "license.created", name: "Licencia creada" },
  { method: "PUT", pattern: /^\/license\/\d+\/?$/, type_key: "license.updated", name: (req) => nameWithEntity("Licencia", req, "id") },
  { method: "DELETE", pattern: /^\/license\/\d+\/?$/, type_key: "license.deleted", name: (req) => nameWithEntity("Licencia", req, "id") },
  { method: "POST", pattern: /^\/renoveLicense\/?$/, type_key: "license.renewed", name: "Licencia renovada" },
];

const KNOWN_ROOT_SEGMENTS = new Set([
  "login", "logout", "changeRole", "users", "accounts", "account", "rol",
  "orders", "inventory", "shifts", "finance", "notifications",
  "notification-programs", "tasks", "publicidad", "media", "documents",
  "img", "files", "sri", "app", "comands", "editor", "subscription",
  "addLicense", "license", "renoveLicense",
]);

function nameWithEntity(label, req, paramKey) {
  const id =
    req.params?.[paramKey] ||
    req.params?.id ||
    extractFirstNumericId(req.originalUrl || req.url);
  return id ? `${label} #${id}` : label;
}

function orderName(responseBody) {
  const id =
    responseBody?.id ||
    responseBody?.order?.id ||
    responseBody?.data?.id ||
    responseBody?.orderId;
  return id ? `Pedido #${id}` : "Pedido creado";
}

function extractFirstNumericId(url) {
  const match = String(url || "").match(/\/(\d+)(?:\/|$|\?)/);
  return match?.[1] || null;
}

function stripApiPrefix(pathname) {
  let p = String(pathname || "").split("?")[0] || "";
  p = p.replace(/\/{2,}/g, "/");
  const apiPrefix = String(process.env.API_PREFIX || "eddeliapi").replace(/^\/+|\/+$/g, "");
  if (p.startsWith(`/${apiPrefix}/`)) {
    return p.slice(apiPrefix.length + 1);
  }
  if (p === `/${apiPrefix}`) return "/";

  const m = p.match(/^\/([^/]+)(\/.*)?$/);
  if (m) {
    const rest = m[2] || "/";
    if ([...KNOWN_ROOT_SEGMENTS].some((seg) => rest === `/${seg}` || rest.startsWith(`/${seg}/`)) || rest.startsWith("/app/")) {
      return rest;
    }
  }
  return p.startsWith("/") ? p : `/${p}`;
}

export function normalizePath(endPoint) {
  try {
    if (String(endPoint).startsWith("http")) {
      return stripApiPrefix(new URL(endPoint).pathname);
    }
  } catch {
    /* ignore */
  }
  return stripApiPrefix(endPoint);
}

function sanitizeObject(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeObject(item, depth + 1));
  }
  if (typeof value !== "object") return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    out[key] = sanitizeObject(val, depth + 1);
  }
  return out;
}

function buildMetadata(req, responseBody) {
  return {
    method: req.method,
    path: normalizePath(req.originalUrl || req.url),
    params: sanitizeObject(req.params),
    query: sanitizeObject(req.query),
    body: sanitizeObject(req.body),
    response: sanitizeObject(responseBody),
    user: req.user
      ? {
          accountId: req.user.accountId,
          userId: req.user.userId,
          loginRol: req.user.loginRol,
        }
      : null,
    timestamp: new Date().toISOString(),
  };
}

function resolveName(rule, req, responseBody) {
  if (typeof rule.name === "function") return rule.name(req, responseBody);
  return rule.name;
}

function fallbackEvent(method, path, req, responseBody) {
  const suffix = METHOD_SUFFIX[method];
  if (!suffix) return null;

  const parts = path.split("/").filter(Boolean);
  let prefix = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) continue;
    prefix = RESOURCE_EVENT_PREFIX[parts[i]];
    if (prefix) break;
  }
  if (!prefix && parts[0]) prefix = RESOURCE_EVENT_PREFIX[parts[0]];
  if (!prefix) return null;

  const type_key = `${prefix}.${suffix}`;
  const label = type_key.replace(/\./g, " ").replace(/_/g, " ");
  const id = extractFirstNumericId(path);
  const name = id ? `${label} #${id}` : label;

  return {
    type_key,
    name,
    metadata: buildMetadata(req, responseBody),
  };
}

/**
 * @returns {{ type_key: string, name: string, metadata: object } | null}
 */
export function resolveWebhookEvent(req, responseBody) {
  const method = String(req.method || "").toUpperCase();
  const path = normalizePath(req.originalUrl || req.url);

  for (const rule of EXPLICIT_RULES) {
    if (rule.method !== method) continue;
    if (!rule.pattern.test(path)) continue;
    return {
      type_key: rule.type_key,
      name: resolveName(rule, req, responseBody),
      metadata: buildMetadata(req, responseBody),
    };
  }

  return fallbackEvent(method, path, req, responseBody);
}

export function listWebhookEventTypeKeys() {
  const keys = new Set(EXPLICIT_RULES.map((r) => r.type_key));
  return [...keys].sort();
}

export { EXPLICIT_RULES };
