/**
 * Crea cliente "Consumidor Final" y reasigna ventas POS de mostrador
 * que quedaron colgadas en el primer cliente del catálogo.
 *
 * Uso:
 *   node scripts/fix-pos-consumidor-final.js          # BD en vivo (backend/.env)
 *   node scripts/fix-pos-consumidor-final.js --backup # solo backup.json
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Op } from "sequelize";

import { sequelize } from "../src/database/connection.js";
import "../src/database/registerEdDeliModels.js";
import { Customer, Order } from "../src/models/Orders.js";
import {
  CAJA_POS_TAG,
  CONSUMIDOR_FINAL_CUSTOMER_NAME,
  findConsumidorFinalCustomer,
  isWalkInPosOrder,
} from "../src/utils/posOrderUtils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupPath = resolve(__dirname, "../src/database/backup.json");

function isWalkInPosRow(order) {
  return isWalkInPosOrder(order);
}

async function fixBackupJson() {
  const data = JSON.parse(readFileSync(backupPath, "utf8"));
  const customers = data.Customer || [];
  const orders = data.Order || [];

  let consumidor = findConsumidorFinalCustomer(customers);
  if (!consumidor) {
    const nextId = customers.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
    consumidor = {
      id: nextId,
      name: CONSUMIDOR_FINAL_CUSTOMER_NAME,
      cedula: null,
      phone: null,
      address: null,
      email: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    customers.push(consumidor);
    data.Customer = customers;
    console.log(`✅ Cliente creado en backup: id=${consumidor.id} "${consumidor.name}"`);
  } else {
    console.log(`ℹ️  Cliente existente en backup: id=${consumidor.id} "${consumidor.name}"`);
  }

  let moved = 0;
  for (const o of orders) {
    if (!isWalkInPosRow(o)) continue;
    if (Number(o.customerId) === Number(consumidor.id)) continue;
    o.customerId = consumidor.id;
    moved += 1;
  }

  data.Order = orders;
  writeFileSync(backupPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`✅ backup.json: ${moved} pedidos POS reasignados a cliente #${consumidor.id}`);
}

async function fixDatabase() {
  await sequelize.authenticate();

  let consumidor = findConsumidorFinalCustomer(await Customer.findAll());
  if (!consumidor) {
    consumidor = await Customer.create({
      name: CONSUMIDOR_FINAL_CUSTOMER_NAME,
    });
    console.log(`✅ Cliente creado en BD: id=${consumidor.id} "${consumidor.name}"`);
  } else {
    console.log(`ℹ️  Cliente existente en BD: id=${consumidor.id} "${consumidor.name}"`);
  }

  const posOrders = await Order.findAll({
    where: {
      notes: { [Op.like]: `%${CAJA_POS_TAG}%` },
      [Op.or]: [{ documentType: "consumidor_final" }, { documentType: null }],
    },
    attributes: ["id", "customerId", "notes", "documentType"],
  });

  const toMove = posOrders.filter((o) => Number(o.customerId) !== Number(consumidor.id));
  if (toMove.length === 0) {
    console.log("ℹ️  No hay pedidos POS de mostrador que reasignar.");
    return;
  }

  const [updated] = await Order.update(
    { customerId: consumidor.id },
    {
      where: {
        id: { [Op.in]: toMove.map((o) => o.id) },
      },
    },
  );

  console.log(`✅ BD: ${updated} pedidos POS reasignados a cliente #${consumidor.id}`);
}

async function main() {
  const backupOnly = process.argv.includes("--backup");

  try {
    if (backupOnly) {
      await fixBackupJson();
    } else {
      await fixDatabase();
      await fixBackupJson();
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exitCode = 1;
  } finally {
    try {
      await sequelize.close();
    } catch {
      /* ignore */
    }
  }
}

main();
