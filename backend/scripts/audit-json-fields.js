/**
 * Audita backup.json y BD en busca de JSON mal guardado (strings anidados, ////, etc.)
 * Uso: node scripts/audit-json-fields.js [--backup]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { sequelize } from "../src/database/connection.js";
import { InventoryCategory, InventoryProduct, PricingTierGroup } from "../src/models/Inventory.js";
import { repairJsonFieldValue } from "../src/utils/jsonFieldUtils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scanBackup = process.argv.includes("--backup");

const JSON_FIELDS_CAT = ["packageTiers", "mixMatchProductIds"];
const JSON_FIELDS_PROD = ["packageTiers", "wholesaleRules"];
const JSON_FIELDS_TIER_GROUP = ["packageTiers", "productIds"];
const PUBLICIDAD_JSON_FIELDS = ["screenIds", "musicTracks", "schedule", "contentItems"];

function countSlashes(s) {
  let max = 0;
  let cur = 0;
  for (const ch of String(s)) {
    if (ch === "\\") cur += 1;
    else {
      if (cur > max) max = cur;
      cur = 0;
    }
  }
  return max;
}

function analyzeValue(label, id, name, field, raw) {
  if (raw == null || raw === "") return null;
  const s = typeof raw === "string" ? raw : JSON.stringify(raw);
  const issues = [];
  if (typeof raw === "string") issues.push("string-en-bd");
  if (s.includes("////") || countSlashes(s) >= 8) issues.push("slashes-corruptos");
  if (s.length > 500 && typeof raw === "string") issues.push("string-muy-largo");
  try {
    let v = raw;
    for (let i = 0; i < 8; i++) {
      if (typeof v === "string") v = JSON.parse(v);
      else break;
    }
    if (typeof raw === "string" && (Array.isArray(v) || (v && typeof v === "object"))) {
      issues.push("doble-codificado");
    }
  } catch {
    issues.push("parse-fail");
  }
  const uniq = [...new Set(issues)];
  if (!uniq.length) return null;
  return {
    label,
    id,
    name,
    field,
    issues: uniq,
    preview: s.slice(0, 120),
    slashRun: countSlashes(s),
  };
}

async function auditDb() {
  const problems = [];
  for (const row of await InventoryCategory.findAll({ raw: true })) {
    for (const f of JSON_FIELDS_CAT) {
      const p = analyzeValue("category", row.id, row.name, f, row[f]);
      if (p) problems.push(p);
    }
  }
  for (const row of await InventoryProduct.findAll({ raw: true })) {
    for (const f of JSON_FIELDS_PROD) {
      const p = analyzeValue("product", row.id, row.name, f, row[f]);
      if (p) problems.push(p);
    }
  }
  try {
    for (const row of await PricingTierGroup.findAll({ raw: true })) {
      for (const f of JSON_FIELDS_TIER_GROUP) {
        const p = analyzeValue("tierGroup", row.id, row.name, f, row[f]);
        if (p) problems.push(p);
      }
    }
  } catch {
    /* tabla puede no existir aún */
  }

  try {
    const [pubRows] = await sequelize.query(
      "SELECT id, name, screenIds, musicTracks FROM ERP_publicidad_campaigns LIMIT 500",
    );
    for (const row of pubRows) {
      for (const f of ["screenIds", "musicTracks"]) {
        const p = analyzeValue("publicidad", row.id, row.name, f, row[f]);
        if (p) problems.push(p);
      }
    }
  } catch {
    /* tabla puede no existir */
  }

  return problems;
}

function auditBackupFile() {
  const path = join(__dirname, "../src/database/backup.json");
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error("No se pudo parsear backup.json:", e.message);
    return [];
  }

  const problems = [];
  const tables = [
    ["InventoryCategory", JSON_FIELDS_CAT],
    ["InventoryProduct", JSON_FIELDS_PROD],
    ["PricingTierGroup", JSON_FIELDS_TIER_GROUP],
    ["PublicidadCampaign", ["screenIds", "musicTracks"]],
    ["PublicidadPlaylistItem", ["menuItems"]],
  ];

  for (const [table, fields] of tables) {
    const rows = data[table] || [];
    for (const row of rows) {
      const name = row.name || row.title || `#${row.id}`;
      for (const f of fields) {
        const p = analyzeValue(`backup:${table}`, row.id, name, f, row[f]);
        if (p) problems.push(p);
      }
    }
  }
  return problems;
}

await sequelize.authenticate();
const dbProblems = await auditDb();

console.log("=== BD en vivo ===");
console.log("Problemas:", dbProblems.length);
for (const p of dbProblems) console.log(JSON.stringify(p));

if (scanBackup) {
  const backupProblems = auditBackupFile();
  console.log("\n=== backup.json ===");
  console.log("Problemas:", backupProblems.length);
  const corrupt = backupProblems.filter((p) => p.issues.includes("slashes-corruptos"));
  console.log("Con slashes corruptos (////):", corrupt.length);
  for (const p of backupProblems.slice(0, 30)) console.log(JSON.stringify(p));
  if (backupProblems.length > 30) console.log(`… y ${backupProblems.length - 30} más`);
}

await sequelize.close();
