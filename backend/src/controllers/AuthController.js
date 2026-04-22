import { Users } from "../models/Users.js";
import { Account } from "../models/Account.js";
import bcrypt from "bcrypt";
import { createAccessToken, getHeaderToken, verifyJWT } from "../libs/jwt.js";
import { Roles } from "../models/Roles.js";

export const login = async (req, res) => {
  let { username, password, selectedRoleId } = req.body;

  try {
    const account = await Account.findOne({
      where: { username },
      include: [
        {
          model: Users,
          as: "user",
        },
        {
          model: Roles,
          as: "roles",
          through: { attributes: [] },
        },
      ],
    });

    if (!account) {
      return res.status(400).json({ message: "Datos incorrectos" });
    }

    const isCorrectPassword = await bcrypt.compare(password, account.password);
    if (!isCorrectPassword) {
      return res.status(400).json({ message: "Datos incorrectos" });
    }

    if (!account.roles || account.roles.length === 0) {
      return res.status(400).json({ message: "La cuenta no tiene roles asignados" });
    }

    if (!selectedRoleId) {
      if (account.roles.length > 1) {
        return res.json({
          selectRole: true,
          roles: account.roles.map((role) => ({
            id: role.id,
            name: role.name,
          })),
          accountId: account.id,
        });
      }

      selectedRoleId = account.roles[0]?.id;
    }

    const selectedRole = account.roles.find((r) => r.id === selectedRoleId);
    if (!selectedRole) {
      return res.status(400).json({ message: "Rol seleccionado inválido" });
    }

    const payload = {
      userId: account.userId,
      accountId: account.id,
      rolId: selectedRole.id,
      loginRol: selectedRole.name,
    };

    const token = await createAccessToken({ payload });

    res.json({ message: "User authenticated", token });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: error.message });
  }
};

export const changeRole = async (req, res) => {
  const { accountId, rolId } = req.body;
  try {
    const account = await Account.findByPk(accountId, {
      include: [
        {
          model: Roles,
          as: "roles",
          through: { attributes: [] },
        },
      ],
    });

    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    const hasRole = account.roles.find((r) => r.id === rolId);
    if (!hasRole) {
      return res.status(403).json({ message: "No tiene asignado ese rol" });
    }

    const payload = {
      userId: account.userId,
      accountId: account.id,
      rolId: hasRole.id,
      loginRol: hasRole.name,
    };

    const token = await createAccessToken({ payload });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Error al cambiar de rol", error: error.message });
  }
};

export const verifytoken = async (req, res) => {
  try {
    const token = getHeaderToken(req);

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = await verifyJWT(token);

    res.json(decoded);
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
