export const ROLE_OWNER = "Propietario";
export const ROLE_ADMIN = "Administrador";
export const ROLE_EMPLOYEE = "Empleado";
export const ROLE_PROGRAMMER = "Programador";
export const ROLE_SUPPLIER = "Proveedor";
export const ROLE_SUPPLIER_LEGACY = "Proovedor";

export function normalizeRoleName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (raw === ROLE_SUPPLIER_LEGACY) return ROLE_SUPPLIER;
  return raw;
}

export function isSupplierRoleName(name) {
  return normalizeRoleName(name) === ROLE_SUPPLIER;
}

export function isPrivilegedRoleName(name) {
  const normalized = normalizeRoleName(name);
  return (
    normalized === ROLE_OWNER ||
    normalized === ROLE_PROGRAMMER ||
    normalized === ROLE_ADMIN
  );
}

/** Propietario o Programador (mismos poderes de negocio). */
export function isOwnerLikeRoleName(name) {
  const normalized = normalizeRoleName(name);
  return normalized === ROLE_OWNER || normalized === ROLE_PROGRAMMER;
}
