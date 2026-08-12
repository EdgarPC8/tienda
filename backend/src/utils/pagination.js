/**
 * Paginación estándar para listados del API.
 * - `?all=true` → sin límite (compatibilidad con caja, formularios, etc.)
 * - `?page=1&pageSize=50` → respuesta paginada
 */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

export function parsePagination(req, { defaultPageSize = DEFAULT_PAGE_SIZE, maxPageSize = MAX_PAGE_SIZE } = {}) {
  if (req.query.all === "true" || req.query.all === "1") {
    return { all: true };
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const rawSize = Number.parseInt(req.query.pageSize ?? req.query.limit, 10);
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Number.isFinite(rawSize) ? rawSize : defaultPageSize),
  );

  return {
    all: false,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  };
}

export function sendPaginated(res, { rows, total, page, pageSize }) {
  return res.json({
    data: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

/** Extrae filas de respuesta paginada o array legacy. */
export function unwrapListPayload(body) {
  if (Array.isArray(body)) return body;
  if (body?.data && Array.isArray(body.data)) return body.data;
  if (body?.products && Array.isArray(body.products)) return body.products;
  return [];
}
