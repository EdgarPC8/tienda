import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { InventoryCategory, InventoryProduct } from "../src/models/Inventory.js";

await sequelize.authenticate();
const cats = await InventoryCategory.findAll({ order: [["id", "ASC"]], raw: true });
const products = await InventoryProduct.findAll({
  attributes: [
    "id",
    "name",
    "type",
    "categoryId",
    "isGenericIngredient",
    "genericProductId",
    "price",
  ],
  order: [["name", "ASC"]],
  raw: true,
});

console.log("=== CATEGORIAS (" + cats.length + ") ===");
for (const c of cats) {
  console.log(JSON.stringify(c));
}
console.log("=== PRODUCTOS (" + products.length + ") ===");
for (const p of products) {
  console.log(JSON.stringify(p));
}
await sequelize.close();
