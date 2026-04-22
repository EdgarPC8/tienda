import { promises as fs } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { sequelize } from "./connection.js";
import "../models/index.js";
import { Roles } from "../models/Roles.js";
import { Users } from "../models/Users.js";
import { Account, AccountRoles } from "../models/Account.js";
import { Notifications } from "../models/Notifications.js";
import { UserData } from "../models/UserData.js";
import { Logs } from "../models/Logs.js";
import {
  Supplier,
  MeasureUnit,
  ProductCategory,
  Brand,
  StoreProduct,
  Purchase,
  PurchaseItem,
  StockMovement,
  FinanceEntry,
  Customer,
  SaleOrder,
  SaleOrderItem,
} from "../models/Tienda.js";

/** JSON principal de respaldo base (users/roles/account/notifications/logs). */
export const backupFilePath = resolve(__dirname, "backup.json");
export const backups = resolve(__dirname, "..", "backups");

const BULK_OPT = { returning: false };

const emptyBackup = () => ({
  Roles: [],
  Users: [],
  UserData: [],
  Account: [],
  AccountRoles: [],
  Notifications: [],
  Logs: [],
  TiendaSuppliers: [],
  TiendaMeasureUnits: [],
  TiendaProductCategories: [],
  TiendaBrands: [],
  TiendaProducts: [],
  TiendaPurchases: [],
  TiendaPurchaseItems: [],
  TiendaStockMovements: [],
  TiendaFinanceEntries: [],
  TiendaCustomers: [],
  TiendaOrders: [],
  TiendaOrderItems: [],
});

/**
 * Inserta en BD el contenido del JSON (transacción).
 * @param {{ skipIfEmpty?: boolean }} opts — si skipIfEmpty y no hay roles ni cuentas, no hace nada
 */
async function applyBackupFromJson(jsonData, opts = {}) {
  const { skipIfEmpty = false } = opts;
  const roles = jsonData.Roles || [];
  const accounts = jsonData.Account || [];
  if (skipIfEmpty && roles.length === 0 && accounts.length === 0) {
    console.log("ℹ️  backup.json sin Roles ni Account; no se inserta nada.");
    return false;
  }

  const t = await sequelize.transaction();
  try {
    const opt = { ...BULK_OPT, transaction: t };

    await Roles.bulkCreate(jsonData.Roles || [], opt);
    await Users.bulkCreate(jsonData.Users || [], opt);
    await UserData.bulkCreate(jsonData.UserData || [], opt);
    await Account.bulkCreate(jsonData.Account || [], opt);
    await AccountRoles.bulkCreate(jsonData.AccountRoles || [], opt);
    await Notifications.bulkCreate(jsonData.Notifications || [], opt);
    await Logs.bulkCreate(jsonData.Logs || [], opt);
    await Supplier.bulkCreate(jsonData.TiendaSuppliers || [], opt);
    await MeasureUnit.bulkCreate(jsonData.TiendaMeasureUnits || [], opt);
    await ProductCategory.bulkCreate(jsonData.TiendaProductCategories || [], opt);
    await Brand.bulkCreate(jsonData.TiendaBrands || [], opt);
    await StoreProduct.bulkCreate(jsonData.TiendaProducts || [], opt);
    await Purchase.bulkCreate(jsonData.TiendaPurchases || [], opt);
    await PurchaseItem.bulkCreate(jsonData.TiendaPurchaseItems || [], opt);
    await StockMovement.bulkCreate(jsonData.TiendaStockMovements || [], opt);
    await FinanceEntry.bulkCreate(jsonData.TiendaFinanceEntries || [], opt);
    await Customer.bulkCreate(jsonData.TiendaCustomers || [], opt);
    await SaleOrder.bulkCreate(jsonData.TiendaOrders || [], opt);
    await SaleOrderItem.bulkCreate(jsonData.TiendaOrderItems || [], opt);

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  return true;
}

/**
 * Al arrancar el servidor: si la BD está vacía (sin cuentas), importa backup.json.
 * Si ya hay datos, no hace nada (evita duplicados).
 */
export async function insertDataIfEmpty() {
  try {
    const cuentaCount = await Account.count();
    if (cuentaCount > 0) {
      console.log("ℹ️  BD ya tiene cuentas; omitiendo importación inicial desde backup.json.");
      return;
    }

    let jsonData;
    try {
      const raw = await fs.readFile(backupFilePath, "utf8");
      jsonData = JSON.parse(raw);
    } catch (e) {
      if (e.code === "ENOENT") {
        await fs.writeFile(backupFilePath, JSON.stringify(emptyBackup(), null, 2));
        console.log("📄 Creado backup.json vacío en:", backupFilePath);
        return;
      }
      throw e;
    }

    const ok = await applyBackupFromJson(jsonData, { skipIfEmpty: true });
    if (ok) {
      console.log("✅ Datos iniciales cargados desde backup.json (arranque).");
    }
  } catch (error) {
    console.error("❌ Error importando backup al inicio:", error.message);
  }
}

/**
 * Inserta datos desde backup.json (reload manual / comandos).
 * Si subes un backup completo de EdDeli, solo se importan estas tablas; el resto del JSON se ignora.
 */
export const insertData = async () => {
  try {
    await fs.access(backupFilePath);
    const data = await fs.readFile(backupFilePath, "utf8");
    const jsonData = JSON.parse(data);

    await applyBackupFromJson(jsonData, { skipIfEmpty: false });

    console.log("✅ Datos insertados desde backup.json (tienda).");
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(backupFilePath, JSON.stringify(emptyBackup(), null, 2));
      console.log("📄 Creado backup.json vacío en:", backupFilePath);
    } else {
      console.error("Error al insertar datos:", error);
      throw error;
    }
  }
};

export const saveBackup = async () => {
  const [
    rolesData,
    usersData,
    userDataRows,
    accountData,
    accountRolesData,
    notificationsData,
    logsData,
    tiendaSuppliersData,
    tiendaMeasureUnitsData,
    tiendaProductCategoriesData,
    tiendaBrandsData,
    tiendaProductsData,
    tiendaPurchasesData,
    tiendaPurchaseItemsData,
    tiendaStockMovementsData,
    tiendaFinanceEntriesData,
    tiendaCustomersData,
    tiendaOrdersData,
    tiendaOrderItemsData,
  ] = await Promise.all([
    Roles.findAll({ raw: true }),
    Users.findAll({ raw: true }),
    UserData.findAll({ raw: true }),
    Account.findAll({ raw: true }),
    AccountRoles.findAll({ raw: true }),
    Notifications.findAll({ raw: true }),
    Logs.findAll({ raw: true }),
    Supplier.findAll({ raw: true }),
    MeasureUnit.findAll({ raw: true }),
    ProductCategory.findAll({ raw: true }),
    Brand.findAll({ raw: true }),
    StoreProduct.findAll({ raw: true }),
    Purchase.findAll({ raw: true }),
    PurchaseItem.findAll({ raw: true }),
    StockMovement.findAll({ raw: true }),
    FinanceEntry.findAll({ raw: true }),
    Customer.findAll({ raw: true }),
    SaleOrder.findAll({ raw: true }),
    SaleOrderItem.findAll({ raw: true }),
  ]);

  const backupData = {
    Roles: rolesData,
    Users: usersData,
    UserData: userDataRows,
    Account: accountData,
    AccountRoles: accountRolesData,
    Notifications: notificationsData,
    Logs: logsData,
    TiendaSuppliers: tiendaSuppliersData,
    TiendaMeasureUnits: tiendaMeasureUnitsData,
    TiendaProductCategories: tiendaProductCategoriesData,
    TiendaBrands: tiendaBrandsData,
    TiendaProducts: tiendaProductsData,
    TiendaPurchases: tiendaPurchasesData,
    TiendaPurchaseItems: tiendaPurchaseItemsData,
    TiendaStockMovements: tiendaStockMovementsData,
    TiendaFinanceEntries: tiendaFinanceEntriesData,
    TiendaCustomers: tiendaCustomersData,
    TiendaOrders: tiendaOrdersData,
    TiendaOrderItems: tiendaOrderItemsData,
  };

  await fs.mkdir(backups, { recursive: true });

  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  const backupFileName = `backup-${timestamp}.json`;
  const backupPath = resolve(backups, backupFileName);

  await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
  await fs.writeFile(backupFilePath, JSON.stringify(backupData, null, 2));

  console.log("Backup tienda guardado en:", backupPath);
  return backupPath;
};

/** GET /tiendaapi/comands/downloadBackup */
export const downloadBackup = async (req, res) => {
  try {
    const backupPath = await saveBackup();
    res.download(backupPath, (err) => {
      if (err) {
        console.error("Error al enviar el archivo:", err);
        res.status(500).send("Error al enviar el archivo.");
      }
    });
  } catch (error) {
    console.error("Error al realizar el backup:", error);
    res.status(500).send("Error al realizar el backup.");
  }
};
