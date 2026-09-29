/**
 * Roles simultáneos del producto (flags) + sync del ENUM legado `type`.
 * isRaw     → disponible como insumo en recetas
 * isRecipe  → se fabrica / intermedio o final con producción
 * isSellable → se vende en POS / pedidos
 */

import { sequelize } from "../database/connection.js";

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "si", "sí"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return Boolean(fallback);
}

export function flagsFromType(type) {
  const t = String(type || "final").toLowerCase();
  if (t === "raw") return { isRaw: true, isRecipe: false, isSellable: false };
  if (t === "intermediate") return { isRaw: true, isRecipe: true, isSellable: false };
  return { isRaw: false, isRecipe: false, isSellable: true };
}

export function typeFromFlags({ isRaw, isRecipe, isSellable }) {
  if (isRaw && isSellable) return "raw";
  if (isRaw && isRecipe && !isSellable) return "intermediate";
  if (isRecipe && isSellable && !isRaw) return "final";
  if (isSellable) return "final";
  if (isRecipe) return "intermediate";
  if (isRaw) return "raw";
  return "final";
}

/**
 * Normaliza flags + type en el payload de create/update.
 * Prioriza flags si vienen en el body; si no, deriva desde type.
 */
export function syncProductRoleFlags(payload, existing = null) {
  if (!payload || typeof payload !== "object") return;

  const hasFlagInput =
    "isRaw" in payload || "isRecipe" in payload || "isSellable" in payload;

  let isRaw;
  let isRecipe;
  let isSellable;

  if (hasFlagInput) {
    const fromType = flagsFromType(payload.type ?? existing?.type ?? "final");
    isRaw = parseBool(
      payload.isRaw,
      existing?.isRaw != null ? existing.isRaw : fromType.isRaw,
    );
    isRecipe = parseBool(
      payload.isRecipe,
      existing?.isRecipe != null ? existing.isRecipe : fromType.isRecipe,
    );
    isSellable = parseBool(
      payload.isSellable,
      existing?.isSellable != null ? existing.isSellable : fromType.isSellable,
    );
  } else {
    const mapped = flagsFromType(payload.type ?? existing?.type ?? "final");
    isRaw = mapped.isRaw;
    isRecipe = mapped.isRecipe;
    isSellable = mapped.isSellable;
  }

  if (!isRaw && !isRecipe && !isSellable) {
    isSellable = true;
  }

  payload.isRaw = isRaw;
  payload.isRecipe = isRecipe;
  payload.isSellable = isSellable;
  payload.type = typeFromFlags({ isRaw, isRecipe, isSellable });
}

let ensurePromise = null;

/** ALTER + backfill una sola vez por proceso. */
export async function ensureProductRoleFlagsSchema() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const cols = [
      { name: "isRaw", after: "isGenericIngredient" },
      { name: "isRecipe", after: "isRaw" },
      { name: "isSellable", after: "isRecipe" },
    ];
    let addedAny = false;
    for (const col of cols) {
      const [rows] = await sequelize.query(
        `SHOW COLUMNS FROM \`ERP_inventory_products\` LIKE '${col.name}'`,
      );
      if (!rows?.length) {
        await sequelize.query(
          `ALTER TABLE \`ERP_inventory_products\` ADD COLUMN \`${col.name}\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`${col.after}\``,
        );
        addedAny = true;
      }
    }

    // Filas aún sin migrar (los tres en 0): rellenar desde type legado.
    await sequelize.query(`
      UPDATE \`ERP_inventory_products\`
      SET
        \`isRaw\` = CASE
          WHEN \`type\` IN ('raw', 'intermediate') THEN 1 ELSE 0
        END,
        \`isRecipe\` = CASE
          WHEN \`type\` = 'intermediate' THEN 1 ELSE 0
        END,
        \`isSellable\` = CASE
          WHEN \`type\` = 'final' THEN 1 ELSE 0
        END
      WHERE \`isRaw\` = 0 AND \`isRecipe\` = 0 AND \`isSellable\` = 0
    `);

    const [packCols] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_inventory_products` LIKE 'packContents'",
    );
    if (!Array.isArray(packCols) || packCols.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_inventory_products` ADD COLUMN `packContents` JSON NULL AFTER `unitsPerPack`",
      );
      addedAny = true;
    }

    if (addedAny) {
      console.log("[schema] ERP_inventory_products: isRaw / isRecipe / isSellable / packContents listos");
    }
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}
