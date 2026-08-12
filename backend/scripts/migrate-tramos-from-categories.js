/**
 * Migra tramos/canasta surtido desde categorías al módulo ERP_pricing_tier_groups.
 * Uso: npm run db:migrate:tramos
 */
import "../src/database/connection.js";
import { sequelize } from "../src/database/connection.js";
import { InventoryCategory, PricingTierGroup } from "../src/models/Inventory.js";
import { normalizePackageTiersStrict } from "../src/utils/productPricingUtils.js";

function normalizeProductIds(raw) {
  if (raw == null || raw === "") return null;
  let val = raw;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(val)) return null;
  const ids = [...new Set(val.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  return ids.length ? ids : null;
}

async function main() {
  await sequelize.sync({ alter: true });

  const categories = await InventoryCategory.findAll();
  let created = 0;
  let cleared = 0;

  for (const cat of categories) {
    const tiers = normalizePackageTiersStrict(cat.packageTiers);
    const productIds = normalizeProductIds(cat.mixMatchProductIds);
    if (!tiers?.length || !productIds?.length) continue;

    const label = String(cat.mixMatchLabel ?? "").trim() || cat.name;
    const existing = await PricingTierGroup.findOne({
      where: { categoryId: cat.id, name: label },
    });

    if (!existing) {
      await PricingTierGroup.create({
        name: label,
        description: cat.description || null,
        categoryId: cat.id,
        packageTiers: tiers,
        productIds,
        isActive: true,
        position: 0,
      });
      created += 1;
      console.log(`   ✓ Grupo "${label}" (categoría ${cat.name}, ${productIds.length} productos)`);
    } else {
      console.log(`   · Ya existe "${label}" para categoría ${cat.name}`);
    }

    await InventoryCategory.update(
      { packageTiers: null, mixMatchLabel: null, mixMatchProductIds: null },
      { where: { id: cat.id } },
    );
    cleared += 1;
  }

  const total = await PricingTierGroup.count();
  console.log(`\nMigración lista: ${created} grupo(s) creado(s), ${cleared} categoría(s) limpiada(s). Total tramos: ${total}.`);
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
