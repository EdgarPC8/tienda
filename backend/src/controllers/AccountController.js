import { Account, AccountRoles } from "../models/Account.js";
import { Roles } from "../models/Roles.js";
import { Users } from "../models/Users.js";
import bcrypt from "bcrypt";

export const getRoles = async (req, res) => {
  try {
    const data = await Roles.findAll();
    res.json(data);
  } catch (error) {
    console.error("Error al obtener los roles:", error);
    res.status(500).json({ message: "Error en el servidor." });
  }
};

export const addAccount = async (req, res) => {
  try {
    const {
      username,
      newPassword,
      confirmPassword,
      roles,
      userId,
    } = req.body;

    if (!newPassword || newPassword.trim() === "") {
      return res.status(400).json({ message: "La contraseña es obligatoria" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const newAccount = await Account.create({
      username,
      password: hashedPassword,
      userId,
    });
    if (roles && roles.length > 0) {
      const roleEntries = roles.map((roleId) => ({
        accountId: newAccount.id,
        roleId,
      }));
      await AccountRoles.bulkCreate(roleEntries);
    }

    res.json({ message: "Cuenta creada con éxito", data: newAccount });
  } catch (error) {
    console.error("Error al crear cuenta:", error);
    res.status(500).json({ message: error.message });
  }
};

export const updateAccount = async (req, res) => {
  const data = req.body;
  const idAccount = req.params.id;

  try {
    const cuenta = await Account.findByPk(idAccount);

    if (!cuenta) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    if (data.username) {
      cuenta.username = data.username;
    }

    if (data.newPassword && data.confirmPassword) {
      if (data.newPassword !== data.confirmPassword) {
        return res.status(400).json({ message: "Las contraseñas nuevas no coinciden" });
      }

      const passgenerate = await bcrypt.hash(data.newPassword, 10);
      cuenta.password = passgenerate;
    }

    await cuenta.save();

    if (Array.isArray(data.roles)) {
      await cuenta.setRoles(data.roles);
    }

    return res.json({ message: "Cuenta actualizada con éxito" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error al actualizar cuenta" });
  }
};

export const updateAccountUser = async (req, res) => {
  const data = req.body;
  const idAccount = req.params.id;

  try {
    const cuenta = await Account.findByPk(idAccount, {
      include: [
        { model: Roles, as: "roles", through: { attributes: [] } },
        { model: Users, as: "user" },
      ],
    });

    if (!cuenta) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    if (data.username) {
      cuenta.username = data.username;
    }

    if (data.oldPassword && data.newPassword) {
      const isValid = await bcrypt.compare(data.oldPassword, cuenta.password);
      if (!isValid) {
        return res.status(401).json({ message: "La contraseña anterior es incorrecta" });
      }

      const hashed = await bcrypt.hash(data.newPassword, 10);
      cuenta.password = hashed;
    }

    await cuenta.save();

    if (Array.isArray(data.roles)) {
      await cuenta.setRoles(data.roles);
    }

    return res.json({
      message: "Cuenta actualizada con éxito",
      data: {
        id: cuenta.id,
        username: cuenta.username,
        roles: await cuenta.getRoles(),
      },
    });
  } catch (error) {
    console.error("Error actualizando cuenta:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const getAccounts = async (req, res) => {
  try {
    const data = await Account.findAll({
      attributes: ["id", "username"],
      include: [
        {
          model: Roles,
          as: "roles",
          attributes: ["id", "name"],
          through: { attributes: [] },
        },
        {
          model: Users,
          as: "user",
          attributes: [
            "firstName",
            "secondName",
            "firstLastName",
            "secondLastName",
            "gender",
          ],
        },
      ],
    });

    res.json(data);
  } catch (error) {
    console.error("Error al obtener cuentas:", error);
    res.status(500).json({ message: "Error en el servidor." });
  }
};

export const getOneAccount = async (req, res) => {
  const { id } = req.params;
  try {
    const data = await Account.findOne({
      where: { id },
      include: [
        {
          model: Roles,
          as: "roles",
          through: { attributes: [] },
        },
      ],
    });

    res.json({
      ...data.toJSON(),
      roles: data.roles.map((r) => r.id),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const getAccount = async (req, res) => {
  const { accountId, rolId } = req.params;

  try {
    const data = await Account.findOne({
      where: { id: accountId },
      attributes: ["username", "id", "userId"],
      include: [
        {
          model: Roles,
          as: "roles",
          through: { attributes: [] },
        },
        {
          model: Users,
          as: "user",
          attributes: [
            "id",
            "firstName",
            "secondName",
            "firstLastName",
            "secondLastName",
            "photo",
            "ci",
            "birthday",
            "gender",
          ],
        },
      ],
    });

    if (!data) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    res.json({
      ...data.toJSON(),
      activeRoleId: parseInt(rolId, 10),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    await Account.destroy({
      where: {
        id: req.params.id,
      },
    });

    res.json({ message: "Cuenta eleminado con éxito" });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const resetPassword = async (req, res) => {
  const idAccount = req.params.id;

  try {
    const passgenerate = await bcrypt.hash("12345678", 10);

    await Account.update(
      {
        password: passgenerate,
      },
      {
        where: {
          id: idAccount,
        },
      }
    );
    res.json({ message: "Password Reseteda a 12345678 con éxito" });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const getOneRol = async (req, res) => {
  const { id } = req.params;
  try {
    const data = await Roles.findOne({
      where: { id },
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const addRol = async (req, res) => {
  try {
    const data = req.body;
    const newData = await Roles.create(data);
    res.json({ message: `agregado con éxito`, data: newData });
  } catch (error) {
    console.error("error al crear el rol:", error);
    res.status(500).json({ message: error.message });
  }
};

export const deleteRol = async (req, res) => {
  try {
    await Roles.destroy({
      where: {
        id: req.params.id,
      },
    });

    res.json({ message: "Rol eleminado con éxito" });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const updateRol = async (req, res) => {
  const data = req.body;

  try {
    await Roles.update(data, {
      where: {
        id: req.params.id,
      },
    });
    res.json({ message: "Rol editado con éxito" });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
