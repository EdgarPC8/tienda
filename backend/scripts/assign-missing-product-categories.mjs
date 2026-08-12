/**
 * Asigna categoryId a productos sin categoría.
 * Uso: node scripts/assign-missing-product-categories.mjs [--apply]
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

/** productId → categoryId */
const MAP = {
  // Abarrotes
  215: 10, // Premezcla TOrta de Chocolate → Premezcla de Chocolate
  240: 30, // Antimoho levapan → Insumos varios
  236: 16, // Azucar Blanca Valdez 50Kg → Azucar
  211: 13, // Bloque de manteca → Mantequilla
  243: 15, // Cocoa La Universal → Cocoa
  283: 22, // crema vegetal cover cream → Crema de leche
  242: 30, // escencia los paisanos → Insumos varios
  238: 30, // Funda de hielo → Insumos varios
  245: 30, // Funda de hielo said → Insumos varios
  223: 30, // Funda de Sal Crisal → Insumos varios
  237: 21, // Grajea Colores → Grajeas
  234: 12, // Harina Premium 50kg → Harina
  235: 7, // levadura instant success → Levadura
  216: 7, // Levadura Instantanea Okedo → Levadura
  248: 13, // Manteca Panificacion → Mantequilla
  233: 13, // Margarina Grasapan → Mantequilla
  241: 8, // Mass cream vainilla → Crema de leche Masscream
  250: 30, // Panela de dulce → Insumos varios
  284: 9, // PastelPan Hojaldrina → Mantequilla Hojaldrina
  282: 23, // Polvo de hornear 5Kg → Royal
  229: 29, // Paquete de servilletas → Empaque

  // Gelatinas en polvo / insumos
  214: 39, // Gelatina de Chicle → Insumos repostería
  212: 39, // Gelatina Fresa/Frambuesa
  213: 39, // Gelatina Piña
  256: 39, // Gelatina sabor a cereza
  258: 39, // Gelatina sabor a frutos rojos
  259: 39, // Gelatina sabor a manzana
  257: 39, // Gelatina sabor a uva

  // Repostería / pastelería terminados
  249: 36, // Bandeja de mocaybas → Suspiros y bocaditos
  262: 28, // Bandeja ovala de galletas → Galletas
  268: 38, // bandeja tres leches grande → Tortas y bandejas
  267: 38, // Bandeja tres leches mediano
  231: 36, // Bocadillos dulce con mani
  230: 35, // Dona normal de color → Donas
  279: 37, // flan → Postres en vaso
  277: 37, // Gelatina Amarilla vaso
  276: 37, // Gelatina Azul vaso
  275: 37, // Gelatina Roja vaso
  210: 37, // Gelatina vaso pequeña fresa
  280: 33, // mini torta corazon vainilla → Pasteles
  278: 37, // mosaico → Postres en vaso
  269: 36, // Mani de dulce

  // Snacks fundas
  274: 36, // Funda de chifle de camote
  272: 36, // Funda de chifle de dulce
  273: 36, // Funda de chifle de sal
  271: 36, // Funda de cuero de chancho
  270: 36, // Funda de cuero de soya

  // Panadería
  239: 26, // FUnda de Pan de yema → Panes
  261: 26, // Mini Pan de Hamburguesa
  244: 26, // Pan de Hamburguesa

  // Líquidos
  263: 40, // Botella de agua Azul Vital → Agua
  208: 40, // Botella de Agua Mineral Guitig
  228: 43, // Cafe Alamor → Café e infusiones
  227: 43, // Cafe Alamor pequeño
  217: 43, // Caja de sobres de SiCafe
  281: 27, // cola big naranja → Gaseosas
  247: 27, // Cola Gallito 2L
  264: 27, // Cola Orangine Manzana
  265: 27, // Cola Orangine Naranja
  266: 27, // Cola Orangine Piña
  246: 27, // Cola Tropical 2L
  226: 42, // Leche Entera Ultra → Lácteos
  285: 44, // pony malta grande → Bebidas varias
  224: 42, // Tarro de Yogurt Fresa
  225: 42, // Tarro de Yogurt Mora
  207: 42, // tony frutilla mediana
  251: 44, // Vive 100 Borojo
  252: 44, // Vive 100 Mango
  253: 44, // Vive 100 Original
  203: 42, // Yogurt Durazno Lactofino
  205: 42, // Yogurt Fresa Lactofino
  202: 42, // Yogurt Frutos del bosque
  254: 42, // Yogurt Guanabana
  206: 42, // Yogurt Mango
  255: 42, // Yogurt Mocaccino
  201: 42, // Yogurt Mora
  221: 42, // Yogurt Paraiso Durazno
  220: 42, // Yogurt Paraiso Fresa
  222: 42, // Yogurt Paraiso Mora
  204: 42, // Yogurt Piña-Coco

  // Accesorios
  260: 45, // Vela de interrogacion economica → Velas
};

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "softed",
  });

  const ids = Object.keys(MAP).map(Number);
  const [cats] = await conn.query(
    `SELECT id, name FROM ERP_inventory_categories WHERE id IN (?)`,
    [Object.values(MAP)]
  );
  const catName = Object.fromEntries(cats.map((c) => [c.id, c.name]));

  const [prods] = await conn.query(
    `SELECT id, name, type, categoryId FROM ERP_inventory_products WHERE id IN (?)`,
    [ids]
  );
  const byId = Object.fromEntries(prods.map((p) => [p.id, p]));

  const missingInDb = ids.filter((id) => !byId[id]);
  const already = ids.filter((id) => byId[id]?.categoryId != null);
  const toUpdate = ids.filter((id) => byId[id] && byId[id].categoryId == null);

  console.log(APPLY ? ">>> APPLY" : ">>> DRY-RUN");
  console.log(`Mapeados: ${ids.length}`);
  console.log(`Faltan en BD: ${missingInDb.length}`, missingInDb);
  console.log(`Ya tenían categoría: ${already.length}`);
  console.log(`A actualizar: ${toUpdate.length}`);

  const byCat = {};
  for (const id of toUpdate) {
    const cid = MAP[id];
    const label = `${cid} ${catName[cid] || "?"}`;
    if (!byCat[label]) byCat[label] = [];
    byCat[label].push(`${id}: ${byId[id].name}`);
  }
  for (const [k, v] of Object.entries(byCat).sort()) {
    console.log(`\n→ ${k} (${v.length})`);
    v.forEach((line) => console.log(`   ${line}`));
  }

  // productos aún sin categoría fuera del mapa
  const [still] = await conn.query(
    `SELECT id, name FROM ERP_inventory_products WHERE categoryId IS NULL ORDER BY id`
  );
  const uncovered = still.filter((p) => !MAP[p.id]);
  if (uncovered.length) {
    console.log(`\n⚠ Sin mapa (${uncovered.length}):`);
    uncovered.forEach((p) => console.log(`   ${p.id}: ${p.name}`));
  }

  if (APPLY && toUpdate.length) {
    for (const id of toUpdate) {
      await conn.query(
        `UPDATE ERP_inventory_products SET categoryId = ?, updatedAt = NOW() WHERE id = ? AND categoryId IS NULL`,
        [MAP[id], id]
      );
    }
    const [left] = await conn.query(
      `SELECT COUNT(*) AS c FROM ERP_inventory_products WHERE categoryId IS NULL`
    );
    console.log(`\n✅ Actualizados ${toUpdate.length}. Quedan sin categoría: ${left[0].c}`);
  } else if (!APPLY) {
    console.log("\nDry-run OK. Para aplicar: node scripts/assign-missing-product-categories.mjs --apply");
  }

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
