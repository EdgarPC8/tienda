import { Op } from "sequelize";
import { SupplierAccount } from "../models/SupplierAccount.js";
import { Account, AccountRoles } from "../models/Account.js";
import { Roles } from "../models/Roles.js";
import { Supplier } from "../models/Orders.js";
import {
  ROLE_SUPPLIER,
  ROLE_SUPPLIER_LEGACY,
  normalizeRoleName,
} from "../utils/roleNames.js";

export async function getLinkedSupplierIdsForAccount(accountId) {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const rows = await SupplierAccount.findAll({
    where: { accountId: id },
    attributes: ["supplierId"],
  });
  return rows
    .map((row) => Number(row.supplierId))
    .filter((value, index, array) => Number.isFinite(value) && array.indexOf(value) === index);
}

export async function accountHasSupplierLink(accountId, supplierId) {
  const rows = await getLinkedSupplierIdsForAccount(accountId);
  return rows.includes(Number(supplierId));
}

async function ensureSupplierRoleId() {
  let role = await Roles.findOne({ where: { name: ROLE_SUPPLIER } });
  if (!role) {
    const legacy = await Roles.findOne({ where: { name: ROLE_SUPPLIER_LEGACY } });
    if (legacy) {
      await legacy.update({ name: ROLE_SUPPLIER });
      role = legacy;
    } else {
      role = await Roles.create({ name: ROLE_SUPPLIER });
    }
  }
  return role;
}

export async function ensureAccountHasSupplierRole(accountId) {
  const role = await ensureSupplierRoleId();
  const account = await Account.findByPk(accountId);
  if (!account) {
    const err = new Error("Cuenta no encontrada");
    err.status = 404;
    throw err;
  }
  const existing = await AccountRoles.findOne({
    where: { accountId: account.id, roleId: role.id },
  });
  if (!existing) {
    await AccountRoles.create({ accountId: account.id, roleId: role.id });
  }
  return account;
}

export async function linkSupplierAccount(supplierId, accountId) {
  const supplier = await Supplier.findByPk(Number(supplierId));
  if (!supplier) {
    const err = new Error("Proveedor no encontrado");
    err.status = 404;
    throw err;
  }
  const account = await ensureAccountHasSupplierRole(Number(accountId));
  // Un proveedor ↔ una sola cuenta (y esa cuenta solo a este proveedor)
  await SupplierAccount.destroy({
    where: {
      [Op.or]: [
        { supplierId: supplier.id },
        { accountId: account.id },
      ],
    },
  });
  const [row, created] = await SupplierAccount.findOrCreate({
    where: { supplierId: supplier.id, accountId: account.id },
    defaults: { supplierId: supplier.id, accountId: account.id },
  });
  return { row, created, supplier, account };
}

export async function unlinkSupplierAccount(supplierId, accountId) {
  const deleted = await SupplierAccount.destroy({
    where: {
      supplierId: Number(supplierId),
      accountId: Number(accountId),
    },
  });
  return { deleted };
}

export async function listSupplierLinkedAccounts(supplierId) {
  const links = await SupplierAccount.findAll({
    where: { supplierId: Number(supplierId) },
  });
  if (!links.length) return [];
  const accounts = await Account.findAll({
    where: { id: { [Op.in]: links.map((l) => l.accountId) } },
    attributes: ["id", "username", "isActive"],
  });
  return accounts.map((a) => ({
    id: a.id,
    username: a.username,
    isActive: a.isActive !== false,
  }));
}
