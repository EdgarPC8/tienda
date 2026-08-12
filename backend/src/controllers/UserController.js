import bcrypt from "bcryptjs";
import { Users } from "../models/Users.js";
import { Account } from "../models/Account.js";
import { Roles } from "../models/Roles.js";
import { UserData } from "../models/UserData.js";
import { UniqueConstraintError } from "sequelize";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

const USER_FIELDS = [
  "ci",
  "documentType",
  "firstName",
  "secondName",
  "firstLastName",
  "secondLastName",
  "birthday",
  "gender",
];

const userInclude = [
  {
    model: Account,
    attributes: ["id", "username", "userId"],
    include: [{ model: Roles, attributes: ["id", "name"], through: { attributes: [] } }],
  },
  {
    model: UserData,
    attributes: ["personalEmail", "institutionalEmail"],
  },
];

function pickUserFields(body) {
  const data = {};
  USER_FIELDS.forEach((key) => {
    if (body[key] !== undefined) data[key] = body[key];
  });
  return data;
}

function resolveEmailFromBody(body) {
  if (body.email !== undefined) return body.email;
  if (body.personalEmail !== undefined) return body.personalEmail;
  return undefined;
}

function getUserDataRow(row) {
  return (
    row.user_datum ||
    row.UserData ||
    row.UserDatum ||
    row.userData ||
    row.userDatum ||
    null
  );
}

function formatUserRow(user) {
  const row = user.toJSON();
  const accounts = row.Accounts || row.accounts || [];
  const primary = accounts[0] || null;
  const userData = getUserDataRow(row);
  const roles = primary?.roles || primary?.Roles || [];

  return {
    ...row,
    email:
      userData?.personalEmail ??
      userData?.institutionalEmail ??
      null,
    Accounts: undefined,
    accounts: undefined,
    UserData: undefined,
    UserDatum: undefined,
    user_datum: undefined,
    userDatum: undefined,
    userData: undefined,
    account: primary
      ? {
          id: primary.id,
          username: primary.username,
          userId: primary.userId,
          roles,
          roleIds: roles.map((role) => role.id),
        }
      : null,
    roles: roles.map((role) => role.id),
  };
}

async function upsertUserAccount(userId, { username, password, roles }) {
  if (!username && !password && !Array.isArray(roles)) return null;

  let account = await Account.findOne({ where: { userId } });

  if (!account) {
    if (!username) return null;

    const hashedPassword =
      password && String(password).trim()
        ? await bcrypt.hash(password, 10)
        : await bcrypt.hash("12345678", 10);

    account = await Account.create({
      username,
      password: hashedPassword,
      userId,
    });
  } else {
    if (username) account.username = username;
    if (password && String(password).trim()) {
      account.password = await bcrypt.hash(password, 10);
    }
    await account.save();
  }

  if (Array.isArray(roles)) {
    await account.setRoles(roles);
  }

  return account;
}

async function upsertUserEmail(userId, email) {
  if (email === undefined) return;

  const [row] = await UserData.findOrCreate({
    where: { idUser: userId },
    defaults: { idUser: userId },
  });

  await row.update({ personalEmail: email || null });
}

// ✅ CREATE (addUser) - ignora "photo" que venga en el body
export const addUser = async (req, res) => {
  try {
    const { photo, username, password, roles, ...rest } = req.body;
    const email = resolveEmailFromBody(req.body);
    const userData = pickUserFields(rest);

    const newUser = await Users.create(userData);

    await upsertUserEmail(newUser.id, email);
    await upsertUserAccount(newUser.id, { username, password, roles });

    const created = await Users.findByPk(newUser.id, { include: userInclude });
    const userRow = formatUserRow(created);

    notifyOk("user.created", `Usuario #${newUser.id}`, { user: userRow });

    return res.json({
      message: "agregado con éxito",
      user: userRow,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError || error.name === "SequelizeUniqueConstraintError") {
      notifyFail("user.create_failed", "Esa cédula ya existe", {
        error,
        req,
        httpStatus: 400,
        extra: { reason: "duplicate_ci" },
      });
      return res.status(400).json({
        message: "Esa cédula ya existe",
      });
    }
    console.error("error al crear el usuario:", error);
    notifyFail("user.create_failed", "Error al crear el usuario", { error, req, httpStatus: 500 });
    return res.status(500).json({
      message: "Error al crear el usuario",
      error: error.message,
    });
  }
};

// ✅ EDIT (updateUserData) - ignora "photo" que venga en el body
export const updateUserData = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { photo, username, password, roles, ...rest } = req.body;
    const email = resolveEmailFromBody(req.body);
    const userData = pickUserFields(rest);

    if (Object.keys(userData).length > 0) {
      await Users.update(userData, { where: { id: userId } });
    }

    await upsertUserEmail(userId, email);
    await upsertUserAccount(userId, { username, password, roles });

    const updated = await Users.findByPk(userId, { include: userInclude });
    const userRow = updated ? formatUserRow(updated) : null;

    notifyOk("user.updated", `Usuario #${userId}`, { user: userRow });

    return res.json({
      message: "usuario editado con éxito",
      user: userRow,
    });
  } catch (error) {
    notifyFail("user.update_failed", `Error al editar usuario #${req.params.userId}`, {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await Users.findAll({
      include: userInclude,
      order: [["id", "ASC"]],
    });

    res.json(users.map(formatUserRow));
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ message: "Error en el servidor." });
  }
};

export const getOneUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await Users.findOne({
      where: { id: userId },
      include: userInclude,
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(formatUserRow(user));
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    await Users.destroy({
      where: { id: userId },
    });

    notifyOk("user.deleted", `Usuario #${userId}`, { userId });

    res.json({ message: "Usuario eleminado con éxito" });
  } catch (error) {
    notifyFail("user.delete_failed", `Error al eliminar usuario #${req.params.userId}`, {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const addUsersBulk = async (req, res) => {
  let usuarios = req.body;

  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    notifyFail("user.bulk_create_failed", "No hay usuarios para registrar", {
      req,
      httpStatus: 400,
      extra: { reason: "empty_payload" },
    });
    return res.status(400).json({ message: "No hay usuarios para registrar" });
  }
  usuarios = usuarios.map(({ id, ...rest }) => rest);
  try {
    const resultado = await Users.bulkCreate(usuarios, {
      ignoreDuplicates: true,
      returning: true,
    });

    notifyOk("user.bulk_created", `${resultado.length} usuarios creados`, {
      insertados: resultado.length,
    });

    res.json({
      insertados: resultado.length,
      detalles: resultado,
    });
  } catch (error) {
    console.error("Error al insertar usuarios:", error);
    notifyFail("user.bulk_create_failed", "Error al insertar usuarios en lote", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
