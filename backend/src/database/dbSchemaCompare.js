import { sequelize } from "./connection.js";

function resolveTableName(model) {
  const t = model.getTableName();
  if (typeof t === "string") return t;
  return t?.tableName || model.tableName;
}

/** Familia de tipo Sequelize → comparable con MySQL. */
function sequelizeColumnFamily(attr) {
  const type = attr?.type;
  const key = String(type?.key || type?.constructor?.key || "").toUpperCase();

  if (["INTEGER", "BIGINT", "SMALLINT", "TINYINT", "MEDIUMINT"].includes(key)) {
    return attr.primaryKey && attr.autoIncrement ? "INT_AI" : "INT";
  }
  if (key === "BOOLEAN") return "BOOL";
  if (["STRING", "CHAR", "UUID"].includes(key)) return "STRING";
  if (["TEXT", "CITEXT"].includes(key)) return "TEXT";
  if (key === "JSON" || key === "JSONB") return "JSON";
  if (key === "DATEONLY") return "DATE";
  if (["DATE", "TIME"].includes(key)) return "DATETIME";
  if (key === "DECIMAL") return "DECIMAL";
  if (["FLOAT", "REAL"].includes(key)) return "FLOAT";
  if (key === "DOUBLE") return "DOUBLE";
  if (key === "ENUM") {
    const values = type?.values || type?.options?.values || [];
    return `ENUM:${[...values].sort().join(",")}`;
  }
  if (key === "BLOB") return "BLOB";
  return key || "UNKNOWN";
}

/** Normaliza tipo devuelto por describeTable (MySQL). */
function mysqlColumnFamily(desc) {
  const raw = String(desc?.type || "").toUpperCase();
  if (raw.startsWith("ENUM")) {
    const inner = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"));
    const values = inner.split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    return `ENUM:${values.sort().join(",")}`;
  }
  if (raw.includes("INT") && desc?.autoIncrement) return "INT_AI";
  if (raw.includes("INT") || raw.includes("BIGINT") || raw.includes("SMALLINT")) return "INT";
  if (raw.startsWith("TINYINT(1)") || raw === "BOOLEAN") return "BOOL";
  if (raw.includes("VARCHAR") || raw.includes("CHAR")) return "STRING";
  if (raw.includes("TEXT")) return "TEXT";
  if (raw === "JSON") return "JSON";
  if (raw === "DATE" && !raw.includes("TIME")) return "DATE";
  if (raw.includes("DATETIME") || raw.includes("TIMESTAMP")) return "DATETIME";
  if (raw.includes("DECIMAL") || raw.includes("NUMERIC")) return "DECIMAL";
  if (raw.includes("DOUBLE")) return "DOUBLE";
  if (raw.includes("FLOAT")) return "FLOAT";
  if (raw.includes("BLOB") || raw.includes("BINARY")) return "BLOB";
  return raw.split("(")[0] || "UNKNOWN";
}

function normalizeEnumFamily(family) {
  if (!String(family).startsWith("ENUM:")) return family;
  const values = family
    .slice(5)
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return `ENUM:${values.join(",")}`;
}

function familiesCompatible(expected, actual) {
  const exp = normalizeEnumFamily(expected);
  const act = normalizeEnumFamily(actual);
  if (exp === act) return true;
  if (expected === actual) return true;
  if (expected === "INT" && actual === "INT_AI") return false;
  if (expected === "INT_AI" && actual === "INT") return false;
  if (expected === "INT" && actual === "INT") return true;
  if ((expected === "BOOL" && actual === "INT") || (expected === "INT" && actual === "BOOL")) {
    return true;
  }
  if (expected === "STRING" && actual === "TEXT") return true;
  if (expected === "TEXT" && actual === "STRING") return true;
  if (expected === "JSON" && actual === "TEXT") return true;
  if (expected === "DATETIME" && actual === "DATE") return true;
  if (expected === "FLOAT" && actual === "DOUBLE") return true;
  if (expected === "DOUBLE" && actual === "FLOAT") return true;
  return false;
}

/**
 * Compara columnas del modelo Sequelize con la tabla en BD.
 * @returns {{ match: boolean, reason?: string }}
 */
export async function compareModelTableSchema(model) {
  const tableName = resolveTableName(model);
  const qi = sequelize.getQueryInterface();

  let description;
  try {
    description = await qi.describeTable(tableName);
  } catch (err) {
    const msg = String(err?.message || err).toLowerCase();
    if (msg.includes("doesn't exist") || msg.includes("does not exist") || msg.includes("no existe")) {
      return { match: false, reason: "tabla no existe", tableName };
    }
    throw err;
  }

  const expectedCols = Object.entries(model.rawAttributes || {});
  const actualNames = new Set(Object.keys(description));

  for (const [name, attr] of expectedCols) {
    if (!actualNames.has(name)) {
      return { match: false, reason: `falta columna ${name}`, tableName };
    }
    const expFamily = sequelizeColumnFamily(attr);
    const actFamily = mysqlColumnFamily(description[name]);
    if (!familiesCompatible(expFamily, actFamily)) {
      return {
        match: false,
        reason: `columna ${name}: esperado ${expFamily}, en BD ${actFamily}`,
        tableName,
      };
    }
  }

  for (const name of actualNames) {
    if (!model.rawAttributes[name]) {
      return { match: false, reason: `columna extra en BD: ${name}`, tableName };
    }
  }

  return { match: true, tableName };
}

/** Audita todas las tablas del backup contra los modelos. */
export async function auditBackupTablesSchema(entries) {
  const results = [];
  for (const entry of entries) {
    const cmp = await compareModelTableSchema(entry.model);
    results.push({ key: entry.key, ...cmp });
  }
  const mismatched = results.filter((r) => !r.match);
  return {
    allMatch: mismatched.length === 0,
    results,
    mismatched,
    matched: results.filter((r) => r.match),
  };
}

export { resolveTableName };
