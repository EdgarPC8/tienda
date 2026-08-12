/**
 * Repara packageTiers / wholesaleRules / mixMatch guardados como string JSON escapado.
 * Uso: npm run db:repair:json-fields
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { InventoryCategory, InventoryProduct, PricingTierGroup } from "../src/models/Inventory.js";
import {
  PublicidadCampaign,
  PublicidadPlaylistItem,
} from "../src/models/Publicidad.js";
import { repairJsonFieldValue } from "../src/utils/jsonFieldUtils.js";

const PRODUCT_JSON_FIELDS = ["packageTiers", "wholesaleRules"];
const CATEGORY_JSON_FIELDS = ["packageTiers", "mixMatchProductIds"];
const TIER_GROUP_JSON_FIELDS = ["packageTiers", "productIds"];
const CAMPAIGN_JSON_FIELDS = ["screenIds", "musicTracks"];
const PLAYLIST_JSON_FIELDS = ["menuItems"];

function normalizeJsonField(raw, { emptyArrayToNull = true } = {}) {
  const repaired = repairJsonFieldValue(raw, { emptyArrayToNull });
  if (repaired == null) return null;
  return repaired;
}

async function repairModel(Model, fields, label, { emptyArrayToNull = true } = {}) {
  const rows = await Model.findAll();
  let fixed = 0;
  for (const row of rows) {
    const updates = {};
    for (const field of fields) {
      const raw = row.getDataValue(field);
      if (raw == null) continue;
      const next = normalizeJsonField(raw, { emptyArrayToNull });
      const same =
        next === raw ||
        (Array.isArray(next) &&
          Array.isArray(raw) &&
          JSON.stringify(next) === JSON.stringify(raw));
      if (typeof raw === "string" || !same) {
        updates[field] = next ?? (emptyArrayToNull ? null : []);
      }
    }
    if (Object.keys(updates).length) {
      await row.update(updates);
      fixed += 1;
    }
  }
  console.log(`   ${label}: ${fixed} fila(s) reparada(s)`);
  return fixed;
}

try {
  await sequelize.authenticate();
  console.log("🔧 Reparando campos JSON (categorías, productos, tramos, publicidad)…");
  const a = await repairModel(InventoryCategory, CATEGORY_JSON_FIELDS, "Categorías");
  const b = await repairModel(InventoryProduct, PRODUCT_JSON_FIELDS, "Productos");
  const t = await repairModel(PricingTierGroup, TIER_GROUP_JSON_FIELDS, "Tramos");
  const c = await repairModel(PublicidadCampaign, CAMPAIGN_JSON_FIELDS, "Publicidad campañas", {
    emptyArrayToNull: false,
  });
  const d = await repairModel(PublicidadPlaylistItem, PLAYLIST_JSON_FIELDS, "Publicidad playlist");
  console.log(`✅ Listo (${a + b + t + c + d} registros actualizados).`);
  await sequelize.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error?.message || error);
  process.exit(1);
}
