import { sequelize } from "../database/connection.js";
import { backupFilePath, insertData, saveBackup } from "../database/insertData.js";
import { promises as fs } from "fs";

export const saveBackupController = async (req, res) => {
  try {
    await saveBackup();
    res.json("ok");
  } catch (error) {
    console.error("Error en saveBackupController:", error);
    return res.status(500).json({
      ok: false,
      message: "Error al guardar el backup",
      error: error.message,
    });
  }
};

export const uploadBackupController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No se envió ningún archivo",
      });
    }

    const content = req.file.buffer.toString("utf8");

    let jsonData;
    try {
      jsonData = JSON.parse(content);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        message: "El archivo no es un JSON válido",
        error: err.message,
      });
    }

    await fs.writeFile(backupFilePath, JSON.stringify(jsonData, null, 2));

    console.log("✅ backup.json tienda reemplazado en:", backupFilePath);

    return res.json({
      ok: true,
      message: "Backup reemplazado. Usa «Recargar BD» para importar.",
      path: backupFilePath,
    });
  } catch (error) {
    console.error("❌ Error al subir backup:", error);
    return res.status(500).json({
      ok: false,
      message: "Error al reemplazar el backup",
      error: error.message,
    });
  }
};

export const reloadBdController = async (req, res) => {
  try {
    console.log("🔄 Reiniciando base de datos (tienda)...");

    const dialect = sequelize.getDialect?.() || "mysql";

    if (dialect === "mysql") {
      await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
      try {
        await sequelize.sync({ force: true });
      } finally {
        await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
      }
    } else {
      await sequelize.sync({ force: true });
    }

    await insertData();
    console.log("✅ Datos importados desde backup.json");

    return res.json({
      ok: true,
      message: "Base reiniciada e inicializada desde backup.json (tienda)",
    });
  } catch (error) {
    console.error("❌ Error en reloadBdController:", error);
    return res.status(500).json({
      ok: false,
      message: "Error al reiniciar la base de datos",
      error: error.message,
    });
  }
};
