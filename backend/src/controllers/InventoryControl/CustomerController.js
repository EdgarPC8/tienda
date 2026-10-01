import { Customer, Order } from "../../models/Orders.js";
import {
  composeCustomerFullName,
  normalizeCustomerPayload,
} from "../../services/customerNameService.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

export const getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.findAll({ order: [["id", "DESC"]] });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener clientes", error });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const payload = normalizeCustomerPayload(req.body || {});
    if (!String(payload.name || "").trim() && !String(payload.firstName || "").trim()) {
      notifyFail("customer.create_failed", "El primer nombre es obligatorio", {
        req,
        httpStatus: 400,
        extra: { reason: "missing_name" },
      });
      return res.status(400).json({ message: "El primer nombre es obligatorio" });
    }
    if (!payload.name) {
      payload.name = composeCustomerFullName(payload) || "Sin nombre";
    }
    if (!payload.firstName) {
      payload.firstName = payload.name;
    }
    if (!payload.identType) payload.identType = "05";
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email).trim())) {
      return res.status(400).json({ message: "El correo no es válido" });
    }
    if (payload.cedula && !/^\d{10}$/.test(String(payload.cedula).replace(/\s/g, "")) && !/^\d{13}$/.test(String(payload.cedula).replace(/\s/g, ""))) {
      return res.status(400).json({ message: "La cédula o el RUC no es válido" });
    }

    if (payload.phone) {
      const existing = await Customer.findOne({ where: { phone: payload.phone } });
      if (existing) {
        notifyFail("customer.create_failed", "Ya existe un cliente con ese teléfono", {
          req,
          httpStatus: 409,
          extra: { reason: "duplicate_phone" },
        });
        return res.status(409).json({ message: "Ya existe un cliente con ese teléfono" });
      }
    }
    if (payload.email) {
      const existing = await Customer.findOne({ where: { email: payload.email } });
      if (existing) {
        return res.status(409).json({ message: "Ya existe un cliente con ese correo" });
      }
    }
    if (payload.cedula) {
      const existing = await Customer.findOne({ where: { cedula: payload.cedula } });
      if (existing) {
        return res.status(409).json({ message: "Ya existe un cliente con esa cédula o RUC" });
      }
    }

    const customer = await Customer.create(payload);
    notifyOk("customer.created", "Cliente creado", { customerId: customer.id });
    res.status(201).json(customer);
  } catch (error) {
    console.error("createCustomer", error);
    notifyFail("customer.create_failed", "Error al crear cliente", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al crear cliente", error: String(error?.message || error) });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      notifyFail("customer.update_failed", `Cliente #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    const current = customer.toJSON();
    const payload = normalizeCustomerPayload({
      firstName: current.firstName,
      secondName: current.secondName,
      firstLastName: current.firstLastName,
      secondLastName: current.secondLastName,
      identType: current.identType,
      cedula: current.cedula,
      name: current.name,
      ...(req.body || {}),
    });

    if (!payload.name) {
      payload.name = composeCustomerFullName(payload) || current.name;
    }

    await customer.update(payload);
    const reloaded = await customer.reload();
    notifyOk("customer.updated", `Cliente #${req.params.id}`, { customerId: reloaded.id });
    res.json(reloaded);
  } catch (error) {
    console.error("updateCustomer", error);
    notifyFail("customer.update_failed", `Error al actualizar cliente #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al actualizar cliente", error: String(error?.message || error) });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      notifyFail("customer.delete_failed", `Cliente #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Cliente no encontrado" });
    }
    const orders = await Order.count({ where: { customerId: customer.id } });
    if (orders > 0) {
      await customer.update({ isActive: false });
      return res.json({ message: "El cliente tiene pedidos. Quedó inactivo para no borrar el historial." });
    }
    await customer.destroy();
    notifyOk("customer.deleted", `Cliente #${req.params.id}`, { customerId: Number(req.params.id) });
    res.json({ message: "Cliente eliminado correctamente" });
  } catch (error) {
    notifyFail("customer.delete_failed", `Error al eliminar cliente #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar cliente", error });
  }
};
