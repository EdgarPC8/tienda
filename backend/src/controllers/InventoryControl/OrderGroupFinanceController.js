import { Op } from "sequelize";


import { sequelize } from "../../database/connection.js";

import { Customer } from "../../models/Orders.js"; // ajusta
import { Order, OrderItem } from "../../models/Orders.js"; // ajusta
import { InventoryProduct } from "../../models/Inventory.js"; // ajusta

import { ItemGroup, ItemGroupItem, Payment,Income } from "../../models/Finance.js"; // ajusta
import { getHeaderToken,verifyJWT} from "../../libs/jwt.js";
import { toFinanceDateTime } from "../../utils/financeDateTime.js";
import {
  isWalkInPosOrder,
  walkInPosOrderExcludeWhere,
} from "../../utils/posOrderUtils.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import {
  ensurePaymentScheduleSchema,
  loadCustomerInstallmentsMap,
  applyFifoPaidToInstallments,
  summarizeNextCredit,
} from "../../services/orderPaymentScheduleService.js";
import {
  resolveGroupPaymentDate,
  syncGroupFinanceDates,
} from "../../utils/customerOrderFinanceUtils.js";
const toNum = (v, def = 0) => {
    const n = Number(v ?? def);
    return Number.isFinite(n) ? n : def;
  };
  
  const isoDateOnly = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  };

  const truncateNote = (text, max = 255) => {
    const s = String(text || "").trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  };

  const isGenericPaymentNote = (note, groupId) => {
    const n = String(note || "").trim().toLowerCase();
    if (!n || n === "abono") return true;
    if (n === `abono grupo #${groupId}`.toLowerCase()) return true;
    // El frontend a veces manda la misma nota auto-generada; no concatenar de nuevo
    if (n.startsWith("abono parcial:")) return true;
    if (n.startsWith("liquidación total:") || n.startsWith("liquidacion total:")) return true;
    if (n.startsWith("abono pedido #") || n.startsWith("abono vinculado")) return true;
    return false;
  };

  /** Nota/concepto descriptivo para abonos y liquidaciones de cobranza. */
  const buildGroupPaymentNote = ({
    customerName,
    groupConcept,
    groupId,
    amount,
    remainingAfter,
    isFullSettlement,
    userNote,
  }) => {
    const amt = Number(Number(amount || 0).toFixed(2));
    const saldo = Number(Number(remainingAfter || 0).toFixed(2));
    const cliente = String(customerName || "Cliente").trim();
    const grupo = String(groupConcept || `Grupo #${groupId}`).trim();
    const rawExtra = String(userNote || "").trim();
    const extra = !isGenericPaymentNote(rawExtra, groupId) ? rawExtra : "";

    let base;
    if (isFullSettlement) {
      base = `Liquidación total: ${cliente} canceló por completo el grupo «${grupo}» (abono $${amt.toFixed(2)}, saldo $0.00)`;
    } else {
      base = `Abono parcial: ${cliente} | grupo «${grupo}» | $${amt.toFixed(2)} | pendiente $${saldo.toFixed(2)}`;
    }

    if (!extra) return truncateNote(base);
    // Evitar "base. base" si el usuario pegó casi el mismo texto
    if (extra.toLowerCase().includes(base.toLowerCase().slice(0, 40))) {
      return truncateNote(extra.length >= base.length ? extra : base);
    }
    return truncateNote(`${base}. ${extra}`);
  };

  const PROGRAMMER_ONLY_MSG = "No tenés permiso para editar o eliminar abonos";
  const assertProgrammerRole = (user) =>
    user?.loginRol === "Programador";

  /**
   * Si el grupo ya tiene abonos (group_payment), esos son la fuente de verdad.
   * Borra incomes por ítem (order_item) del mismo grupo para no sumar el doble.
   */
  const stripDuplicateOrderItemIncomes = async (itemIds, t) => {
    if (!itemIds?.length) return 0;
    return Income.destroy({
      where: {
        referenceType: "order_item",
        referenceId: { [Op.in]: itemIds },
      },
      transaction: t,
    });
  };

  const getGroupFinancials = async (groupId, t, excludePaymentId = null) => {
    const group = await ItemGroup.findByPk(groupId, { transaction: t });
    if (!group) return null;

    const links = await ItemGroupItem.findAll({ where: { groupId }, transaction: t });
    const itemIds = links.map((l) => l.orderItemId);

    let total = 0;
    const items =
      itemIds.length > 0
        ? await OrderItem.findAll({ where: { id: { [Op.in]: itemIds } }, transaction: t })
        : [];

    for (const it of items) {
      const billable = Math.max(
        0,
        toNum(it.quantity) - toNum(it.damagedQty) - toNum(it.giftQty)
      );
      total = Number((total + billable * toNum(it.price)).toFixed(2));
    }

    const payments = await Payment.findAll({
      where: { groupId, status: "completed" },
      transaction: t,
    });

    let paid = 0;
    for (const p of payments) {
      if (excludePaymentId != null && Number(p.id) === Number(excludePaymentId)) continue;
      paid = Number((paid + toNum(p.amount)).toFixed(2));
    }

    // Evitar doble conteo: abono de grupo + "Pago ítem #…" del mismo pedido
    if (paid > 0 && itemIds.length > 0) {
      await stripDuplicateOrderItemIncomes(itemIds, t);
    }

    const remaining = Number(Math.max(0, total - paid).toFixed(2));
    return { group, items, total, paid, remaining, itemIds };
  };

  const syncGroupAfterPayments = async (groupId, t) => {
    const fin = await getGroupFinancials(groupId, t);
    if (!fin) return;
    const { group, items, total, remaining } = fin;
    const EPS = 0.0001;

    if (remaining <= EPS && total > EPS) {
      group.status = "closed";
      await group.save({ transaction: t });

      const lastPayment = await Payment.findOne({
        where: { groupId, status: "completed" },
        order: [
          ["date", "DESC"],
          ["id", "DESC"],
        ],
        transaction: t,
      });
      const closeDate = lastPayment?.date ? new Date(lastPayment.date) : new Date();

      for (const it of items) {
        if (!it.paidAt) {
          it.paidAt = closeDate;
          await it.save({ transaction: t });
        }
      }
      return;
    }

    if (group.status === "closed") {
      group.status = "open";
      await group.save({ transaction: t });
    }

    for (const it of items) {
      if (it.paidAt) {
        it.paidAt = null;
        await it.save({ transaction: t });
      }
    }
  };

  export const deleteGroupPayment = async (req, res) => {
    const { paymentId } = req.params;
  
    try {
      const token = getHeaderToken(req);
      const user = await verifyJWT(token);
      if (!assertProgrammerRole(user)) {
        notifyFail("workbench_payment.delete_failed", PROGRAMMER_ONLY_MSG, { req, httpStatus: 403 });
        return res.status(403).json({ message: PROGRAMMER_ONLY_MSG });
      }
  
      const result = await sequelize.transaction(async (t) => {
        const payment = await Payment.findByPk(paymentId, { transaction: t });
        if (!payment) return { status: 404, body: { message: "Pago no existe" } };

        const groupId = payment.groupId;

        await Income.destroy({
          where: { referenceType: "group_payment", referenceId: payment.id },
          transaction: t,
        });

        await payment.destroy({ transaction: t });
        await syncGroupAfterPayments(groupId, t);

        return { status: 200, body: { mensaje: "Pago eliminado", paymentId: Number(paymentId) } };
      });
  
      if (result.status >= 400) {
        notifyFail(
          "workbench_payment.delete_failed",
          result.body?.message || "Error eliminando pago",
          { req, httpStatus: result.status, extra: { paymentId } },
        );
      } else {
        notifyOk("workbench_payment.deleted", `Pago workbench #${paymentId}`, { paymentId: Number(paymentId) });
      }
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("deleteGroupPayment:", error);
      notifyFail("workbench_payment.delete_failed", "Error eliminando pago", {
        error,
        req,
        httpStatus: 500,
      });
      return res.status(500).json({ message: "Error eliminando pago", error: String(error?.message || error) });
    }
  };
  
  export const updateGroupPayment = async (req, res) => {
    const { paymentId } = req.params;
    const { amount, date, note, method, status } = req.body;
  
    try {
      const token = getHeaderToken(req);
      const user = await verifyJWT(token);
      if (!assertProgrammerRole(user)) {
        notifyFail("workbench_payment.update_failed", PROGRAMMER_ONLY_MSG, { req, httpStatus: 403 });
        return res.status(403).json({ message: PROGRAMMER_ONLY_MSG });
      }
  
      const result = await sequelize.transaction(async (t) => {
        const payment = await Payment.findByPk(paymentId, { transaction: t });
        if (!payment) return { status: 404, body: { message: "Pago no existe" } };

        const nextAmount =
          amount != null ? Number(Number(amount).toFixed(2)) : toNum(payment.amount);
        const nextStatus = status != null ? String(status) : payment.status;

        if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
          return { status: 400, body: { message: "Monto inválido" } };
        }

        if (nextStatus === "completed") {
          const fin = await getGroupFinancials(payment.groupId, t, payment.id);
          if (!fin) return { status: 404, body: { message: "Grupo no existe" } };
          const newPaid = Number((fin.paid + nextAmount).toFixed(2));
          if (newPaid > fin.total + 0.0001) {
            return {
              status: 400,
              body: {
                message: `El monto excede el total del grupo. Total: ${fin.total}, otros abonos: ${fin.paid}`,
              },
            };
          }
        }

        if (amount != null) payment.amount = nextAmount;
        if (date != null) payment.date = new Date(date);
        if (note != null) payment.note = String(note);
        if (method != null) payment.method = String(method);
        if (status != null) payment.status = nextStatus;

        await payment.save({ transaction: t });

        const income = await Income.findOne({
          where: { referenceType: "group_payment", referenceId: payment.id },
          transaction: t,
        });

        if (income) {
          await income.update(
            {
              amount: Number(toNum(payment.amount).toFixed(2)),
              date: payment.date,
              concept: payment.note || `Abono grupo #${payment.groupId}`,
              status: payment.status === "completed" ? "paid" : "pending",
            },
            { transaction: t }
          );
        }

        await syncGroupAfterPayments(payment.groupId, t);

        return {
          status: 200,
          body: {
            mensaje: "Pago actualizado",
            pago: { id: payment.id, amount: payment.amount, status: payment.status },
          },
        };
      });
  
      if (result.status >= 400) {
        notifyFail(
          "workbench_payment.update_failed",
          result.body?.message || "Error actualizando pago",
          { req, httpStatus: result.status, extra: { paymentId } },
        );
      } else {
        notifyOk("workbench_payment.updated", `Pago workbench #${paymentId}`, { paymentId: Number(paymentId) });
      }
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("updateGroupPayment:", error);
      notifyFail("workbench_payment.update_failed", "Error actualizando pago", {
        error,
        req,
        httpStatus: 500,
      });
      return res.status(500).json({ message: "Error actualizando pago", error: String(error?.message || error) });
    }
  };
    
  export const payItemGroup = async (req, res) => {
    const { groupId } = req.params;
    const { amount, date, note, method } = req.body;

    /** Solo para montos acumulados / guardados (2 dec). No usar para precio unitario antes de × cantidad. */
    const roundMoney = (x) => Number(Number(x || 0).toFixed(2));
    const EPS = 0.0001;
  
    const payAmount = Number(amount);
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      notifyFail(
        req.raptorNotify?.fail || "item_group.paid_failed",
        "Monto inválido",
        { req, httpStatus: 400 },
      );
      return res.status(400).json({ message: "Monto inválido" });
    }

    console.log("[payItemGroup] entrada", {
      groupId: Number(groupId),
      amountRaw: amount,
      payAmountParsed: payAmount,
      date,
      note,
      method,
    });
  
    try {
      const token = getHeaderToken(req);
      const user = await verifyJWT(token);
  
      const result = await sequelize.transaction(async (t) => {
        const group = await ItemGroup.findByPk(groupId, { transaction: t });
        if (!group) return { status: 404, body: { message: "Grupo no existe" } };
        if (group.status !== "open") return { status: 400, body: { message: "Grupo no está abierto" } };
  
        // items del grupo
        const links = await ItemGroupItem.findAll({ where: { groupId: group.id }, transaction: t });
        const itemIds = links.map((x) => x.orderItemId);
  
        if (itemIds.length === 0) {
          return { status: 400, body: { message: "El grupo no tiene items" } };
        }
  
        const items = await OrderItem.findAll({
          where: { id: { [Op.in]: itemIds } },
          // agrega aquí los campos que uses para el total real (dañado/yapa/etc)
          attributes: ["id", "orderId", "price", "quantity", "paidAt", "damagedQty", "giftQty"],
          transaction: t,
        });

        const orderIds = [...new Set(items.map((it) => it.orderId).filter(Boolean))];
        const orders = orderIds.length
          ? await Order.findAll({
              where: { id: { [Op.in]: orderIds } },
              attributes: ["id", "date"],
              transaction: t,
            })
          : [];
  
        // ✅ total basado en "vendido cobrable"
        // vendido = quantity - damagedQty - giftQty
        const itemLines = items.map((it) => {
          const qty = toNum(it.quantity);
          const damaged = toNum(it.damagedQty);
          const gift = toNum(it.giftQty);
          const billable = Math.max(0, qty - damaged - gift);
          const unitPrice = toNum(it.price);
          const lineTotal = roundMoney(billable * unitPrice);
          return {
            orderItemId: it.id,
            price: unitPrice,
            quantity: qty,
            damagedQty: damaged,
            giftQty: gift,
            billable,
            lineTotal,
            paidAt: it.paidAt ?? null,
          };
        });

        const total = roundMoney(itemLines.reduce((sum, row) => sum + row.lineTotal, 0));
  
        const alreadyPaid = roundMoney(
          (await Payment.sum("amount", { where: { groupId: group.id, status: "completed" }, transaction: t })) || 0
        );
  
        const remaining = roundMoney(Math.max(0, total - alreadyPaid));

        const diffPayMinusRemaining = roundMoney(payAmount - remaining);

        console.log("[payItemGroup] cálculo servidor", {
          groupId: group.id,
          customerId: group.customerId,
          EPS,
          itemLines,
          total,
          alreadyPaid,
          remaining,
          payAmountSolicitado: roundMoney(payAmount),
          diffPayMinusRemaining,
          remainingLteEps: remaining <= EPS,
          payExceedsRemaining: payAmount > remaining + EPS,
          rawTotalMinusPaid: total - alreadyPaid,
        });
  
        // =========================================================
        // ✅ 0) AUTOCIERRE: si por cambios el saldo ya es 0,
        //    cerramos sin crear un nuevo pago.
        // =========================================================
        if (remaining <= EPS) {
          console.log("[payItemGroup] autocierre (saldo ~0 en servidor, sin nuevo pago)", {
            groupId: group.id,
            payAmountSolicitado: roundMoney(payAmount),
            remaining,
            total,
            alreadyPaid,
          });
          // busca fecha del último pago (si existe)
          const lastPayment = await Payment.findOne({
            where: { groupId: group.id, status: "completed" },
            order: [["date", "DESC"], ["id", "DESC"]],
            attributes: ["date"],
            transaction: t,
          });
  
          const closeDate = lastPayment?.date ? new Date(lastPayment.date) : new Date();
  
          group.status = "closed";
          await group.save({ transaction: t });
  
          // marcar items como pagados si no tienen paidAt
          for (const it of items) {
            if (!it.paidAt) {
              it.paidAt = closeDate;
              await it.save({ transaction: t });
            }
          }
  
          return {
            status: 200,
            body: {
              mensaje: "Grupo ya estaba saldado por cambios en ítems. Se cerró y se marcaron items ✅",
              grupo: { id: group.id, status: group.status },
              resumen: { total, abonadoAcumulado: alreadyPaid, saldo: 0, cerrado: true },
            },
          };
        }
  
        // =========================================================
        // 1) Validar que el abono no exceda el saldo ACTUAL
        // =========================================================
        if (payAmount > remaining + EPS) {
          console.log("[payItemGroup] RECHAZADO abono excede saldo", {
            groupId: group.id,
            payAmountSolicitado: roundMoney(payAmount),
            remainingServidor: remaining,
            limitePermitido: roundMoney(remaining + EPS),
            delta: roundMoney(payAmount - remaining),
          });
          return { status: 400, body: { message: `Abono excede saldo. Saldo: ${remaining}` } };
        }
  
        const paymentDate = resolveGroupPaymentDate({
          explicitDate: date ? toFinanceDateTime(date) : null,
          orderItems: items,
          orders,
        });
        const newPaid = roundMoney(alreadyPaid + payAmount);
        const newRemaining = roundMoney(Math.max(0, total - newPaid));
        const isFullSettlement = newRemaining <= EPS;

        const customer = await Customer.findByPk(group.customerId, {
          attributes: ["id", "name"],
          transaction: t,
        });

        const paymentNote = buildGroupPaymentNote({
          customerName: customer?.name,
          groupConcept: group.concept,
          groupId: group.id,
          amount: payAmount,
          remainingAfter: newRemaining,
          isFullSettlement,
          userNote: note,
        });

        // 2) Crear Payment
        const payment = await Payment.create(
          {
            customerId: group.customerId,
            groupId: group.id,
            date: paymentDate,
            amount: roundMoney(payAmount),
            method: method || "efectivo",
            note: paymentNote,
            status: "completed",
            createdBy: user.accountId,
          },
          { transaction: t }
        );
  
        // 3) Crear Income por ese Payment
        const income = await Income.create(
          {
            date: paymentDate,
            amount: roundMoney(payAmount),
            concept: paymentNote,
            category: "Venta",
            status: "paid",
            referenceType: "group_payment",
            referenceId: payment.id,
            createdBy: user.accountId,
            counterpartyName: customer?.name || null,
          },
          { transaction: t }
        );

        // El abono del grupo reemplaza incomes sueltos por ítem (evita sumar el doble)
        const groupItemIds = items.map((it) => it.id);
        await stripDuplicateOrderItemIncomes(groupItemIds, t);

        console.log("[payItemGroup] abono registrado OK", {
          groupId: group.id,
          paymentId: payment.id,
          monto: roundMoney(payAmount),
          total,
          alreadyPaidAntes: alreadyPaid,
          newPaid,
          newRemaining,
        });
  
        let closed = false;
  
        // 4) Cerrar si ya quedó en 0 con el abono
        if (newRemaining <= EPS) {
          group.status = "closed";
          await group.save({ transaction: t });
  
          for (const it of items) {
            if (!it.paidAt) {
              it.paidAt = paymentDate; // fecha del último pago
              await it.save({ transaction: t });
            }
          }
          closed = true;
        }
  
        return {
          status: 200,
          body: {
            mensaje: closed
              ? "Liquidación total registrada: el cliente saldó el grupo por completo"
              : "Abono parcial registrado",
            grupo: { id: group.id, status: group.status },
            pago: {
              paymentId: payment.id,
              incomeId: income.id,
              amount: roundMoney(payAmount),
              note: paymentNote,
            },
            resumen: { total, abonadoAntes: alreadyPaid, abonadoAcumulado: newPaid, saldo: newRemaining, cerrado: closed },
            closed,
          },
        };
      });
  
      const payNotify = req.raptorNotify || {
        ok: "item_group.paid",
        fail: "item_group.paid_failed",
        okName: `Abono grupo #${groupId}`,
      };
      if (result.status >= 400) {
        notifyFail(payNotify.fail, result.body?.message || "Error registrando abono", {
          req,
          httpStatus: result.status,
          extra: { groupId: Number(groupId) },
        });
      } else {
        notifyOk(payNotify.ok, payNotify.okName, {
          groupId: Number(groupId),
          paymentId: result.body?.pago?.paymentId,
        });
      }
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("payItemGroup:", error);
      notifyFail(
        req.raptorNotify?.fail || "item_group.paid_failed",
        "Error registrando abono",
        { error, req, httpStatus: 500 },
      );
      return res.status(500).json({ message: "Error registrando abono", error: String(error?.message || error) });
    }
  };
  
  
  export const moveItemBetweenGroups = async (req, res) => {
    const { orderItemId, toGroupId } = req.body; 
    // toGroupId = null => quitar del grupo
  
    if (!orderItemId) {
      notifyFail("item_group.item_moved_failed", "orderItemId requerido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "orderItemId requerido" });
    }
  
    try {
      const token = getHeaderToken(req);
      await verifyJWT(token);
  
      const result = await sequelize.transaction(async (t) => {
        const current = await ItemGroupItem.findOne({ where: { orderItemId }, transaction: t });
  
        if (toGroupId == null) {
          // quitar
          if (!current) return { status: 200, body: { mensaje: "El item no estaba en ningún grupo" } };
          await current.destroy({ transaction: t });
          return { status: 200, body: { mensaje: "Item quitado del grupo", orderItemId } };
        }
  
        const group = await ItemGroup.findByPk(toGroupId, { transaction: t });
        if (!group) return { status: 404, body: { message: "Grupo destino no existe" } };
        if (group.status !== "open") return { status: 400, body: { message: "Solo puedes mover a un grupo abierto" } };
  
        // si ya estaba en un grupo, se actualiza (mover)
        if (current) {
          current.groupId = toGroupId;
          await current.save({ transaction: t });
          return { status: 200, body: { mensaje: "Item movido de grupo", orderItemId, toGroupId } };
        }
  
        // si no estaba, se crea
        await ItemGroupItem.create({ groupId: toGroupId, orderItemId }, { transaction: t });
        return { status: 201, body: { mensaje: "Item agregado al grupo", orderItemId, toGroupId } };
      });
  
      if (result.status >= 400) {
        notifyFail(
          "item_group.item_moved_failed",
          result.body?.message || "Error moviendo item",
          { req, httpStatus: result.status, extra: { orderItemId, toGroupId } },
        );
      } else {
        notifyOk("item_group.item_moved", "Ítem movido entre grupos", {
          orderItemId,
          toGroupId,
        });
      }
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("moveItemBetweenGroups:", error);
      notifyFail("item_group.item_moved_failed", "Error moviendo item", {
        error,
        req,
        httpStatus: 500,
      });
      return res.status(500).json({ message: "Error moviendo item", error: String(error?.message || error) });
    }
  };
  
  export const deleteItemGroup = async (req, res) => {
    const { groupId } = req.params;
  
    try {
      const token = getHeaderToken(req);
      await verifyJWT(token);
  
      const result = await sequelize.transaction(async (t) => {
        const group = await ItemGroup.findByPk(groupId, { transaction: t });
        if (!group) return { status: 404, body: { message: "Grupo no existe" } };
  
        const paymentsCount = await Payment.count({ where: { groupId: group.id, status: "completed" }, transaction: t });
        if (paymentsCount > 0) {
          return { status: 400, body: { message: "No se puede eliminar: el grupo ya tiene abonos" } };
        }
  
        await ItemGroupItem.destroy({ where: { groupId: group.id }, transaction: t });
        await group.destroy({ transaction: t });
  
        return { status: 200, body: { mensaje: "Grupo eliminado", groupId: Number(groupId) } };
      });
  
      if (result.status >= 400) {
        notifyFail(
          "item_group.delete_failed",
          result.body?.message || "Error eliminando grupo",
          { req, httpStatus: result.status, extra: { groupId } },
        );
      } else {
        notifyOk("item_group.deleted", `Grupo ítems #${groupId}`, { groupId: Number(groupId) });
      }
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("deleteItemGroup:", error);
      notifyFail("item_group.delete_failed", "Error eliminando grupo", {
        error,
        req,
        httpStatus: 500,
      });
      return res.status(500).json({ message: "Error eliminando grupo", error: String(error?.message || error) });
    }
  };
  
  export const updateItemGroup = async (req, res) => {
    const { groupId } = req.params;
    const { concept, status } = req.body; // status: open/closed/cancelled
  
    try {
      const token = getHeaderToken(req);
      await verifyJWT(token);
  
      const result = await sequelize.transaction(async (t) => {
        const group = await ItemGroup.findByPk(groupId, { transaction: t });
        if (!group) return { status: 404, body: { message: "Grupo no existe" } };
  
        if (concept != null) group.concept = String(concept);
        if (status != null) group.status = String(status);
  
        await group.save({ transaction: t });
  
        return {
          status: 200,
          body: { mensaje: "Grupo actualizado", grupo: { id: group.id, concept: group.concept, status: group.status } },
        };
      });
  
      if (result.status >= 400) {
        notifyFail(
          "item_group.update_failed",
          result.body?.message || "Error actualizando grupo",
          { req, httpStatus: result.status, extra: { groupId } },
        );
      } else {
        notifyOk("item_group.updated", `Grupo ítems #${groupId}`, { groupId: Number(groupId) });
      }
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("updateItemGroup:", error);
      notifyFail("item_group.update_failed", "Error actualizando grupo", {
        error,
        req,
        httpStatus: 500,
      });
      return res.status(500).json({ message: "Error actualizando grupo", error: String(error?.message || error) });
    }
  };
  

export const addItemsToGroup = async (req, res) => {
  const { groupId } = req.params;
  const { itemIds } = req.body;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    notifyFail("item_group.items_added_failed", "itemIds es requerido y debe ser un array no vacío", {
      req,
      httpStatus: 400,
    });
    return res.status(400).json({ message: "itemIds es requerido y debe ser un array no vacío" });
  }

  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);

    const result = await sequelize.transaction(async (t) => {
      // 1) Validar que el grupo existe y está abierto
      const group = await ItemGroup.findByPk(groupId, { transaction: t });
      if (!group) return { status: 404, body: { message: "Grupo no existe" } };
      if (group.status !== "open") {
        return { status: 400, body: { message: "Solo se pueden agregar ítems a grupos abiertos" } };
      }

      // 2) Validar que los ítems pertenecen al mismo cliente que el grupo
      const items = await OrderItem.findAll({
        where: { id: { [Op.in]: itemIds } },
        include: [{ model: Order, as: "ERP_order", attributes: ["id", "customerId"] }],
        transaction: t,
      });

      if (items.length !== itemIds.length) {
        return { status: 400, body: { message: "Algunos ítems no existen" } };
      }

      // Verificar que todos pertenecen al mismo cliente del grupo
      const invalidItems = items.filter((it) => it.ERP_order?.customerId !== group.customerId);
      if (invalidItems.length > 0) {
        return {
          status: 400,
          body: {
            message: "Algunos ítems pertenecen a otro cliente",
            itemsInvalidos: invalidItems.map((it) => ({ orderItemId: it.id, customerId: it.ERP_order?.customerId })),
          },
        };
      }

      // 3) Evitar ítems que ya están en otro grupo (o en este mismo grupo)
      const already = await ItemGroupItem.findAll({
        where: { orderItemId: { [Op.in]: itemIds } },
        transaction: t,
      });

      if (already.length > 0) {
        const alreadyInThisGroup = already.filter((x) => x.groupId === Number(groupId));
        const alreadyInOtherGroup = already.filter((x) => x.groupId !== Number(groupId));

        if (alreadyInOtherGroup.length > 0) {
          return {
            status: 400,
            body: {
              message: "Algunos ítems ya están en otro grupo",
              itemsEnOtroGrupo: alreadyInOtherGroup.map((x) => ({ orderItemId: x.orderItemId, groupId: x.groupId })),
            },
          };
        }

        // Si ya están en este grupo, los filtramos para no duplicar
        const alreadyInThisGroupIds = new Set(alreadyInThisGroup.map((x) => x.orderItemId));
        const newItemIds = itemIds.filter((id) => !alreadyInThisGroupIds.has(id));

        if (newItemIds.length === 0) {
          return { status: 200, body: { mensaje: "Todos los ítems ya estaban en este grupo", itemsAgregados: [] } };
        }

        // Crear solo los nuevos
        await ItemGroupItem.bulkCreate(
          newItemIds.map((id) => ({ groupId: group.id, orderItemId: id })),
          { transaction: t }
        );

        return {
          status: 200,
          body: {
            mensaje: "Ítems agregados al grupo",
            grupo: { id: group.id, customerId: group.customerId, concept: group.concept },
            itemsAgregados: newItemIds,
            itemsYaEnGrupo: Array.from(alreadyInThisGroupIds),
          },
        };
      }

      // 4) Todos son nuevos, crear todos
      await ItemGroupItem.bulkCreate(
        itemIds.map((id) => ({ groupId: group.id, orderItemId: id })),
        { transaction: t }
      );

      return {
        status: 200,
        body: {
          mensaje: "Ítems agregados al grupo",
          grupo: { id: group.id, customerId: group.customerId, concept: group.concept },
          itemsAgregados: itemIds,
        },
      };
    });

    if (result.status >= 400) {
      notifyFail(
        "item_group.items_added_failed",
        result.body?.message || "Error agregando ítems al grupo",
        { req, httpStatus: result.status, extra: { groupId } },
      );
    } else {
      notifyOk("item_group.items_added", `Ítems agregados al grupo #${groupId}`, {
        groupId: Number(groupId),
        itemsAgregados: result.body?.itemsAgregados,
      });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("addItemsToGroup:", error);
    notifyFail("item_group.items_added_failed", "Error agregando ítems al grupo", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error agregando ítems al grupo", error: String(error?.message || error) });
  }
};

export const createItemGroup = async (req, res) => {
  const { customerId, itemIds, concept } = req.body;

  if (!customerId || !Array.isArray(itemIds) || itemIds.length === 0) {
    notifyFail("item_group.create_failed", "customerId e itemIds son requeridos", {
      req,
      httpStatus: 400,
    });
    return res.status(400).json({ message: "customerId e itemIds son requeridos" });
  }

  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const result = await sequelize.transaction(async (t) => {
      // validar items pertenecen a customerId
      const items = await OrderItem.findAll({
        where: { id: { [Op.in]: itemIds } },
        include: [{ model: Order, as: "ERP_order", attributes: ["id", "customerId"], where: { customerId } }],
        transaction: t,
      });

      if (items.length !== itemIds.length) {
        return { status: 400, body: { message: "Items inválidos o no pertenecen al cliente" } };
      }

      // evitar items en otro grupo
      const already = await ItemGroupItem.findAll({
        where: { orderItemId: { [Op.in]: itemIds } },
        transaction: t,
      });
      if (already.length > 0) {
        return {
          status: 400,
          body: {
            message: "Algunos items ya están en otro grupo",
            itemsEnGrupo: already.map((x) => ({ orderItemId: x.orderItemId, groupId: x.groupId })),
          },
        };
      }

      // snapshot total
      const total = Number(
        items.reduce((sum, it) => sum + toNum(it.quantity) * toNum(it.price), 0).toFixed(2)
      );

      const group = await ItemGroup.create(
        {
          customerId,
          concept: concept || `Grupo cliente #${customerId}`,
          totalAmount: total,
          status: "open",
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      await ItemGroupItem.bulkCreate(
        itemIds.map((id) => ({ groupId: group.id, orderItemId: id })),
        { transaction: t }
      );

      return {
        status: 201,
        body: {
          mensaje: "Grupo creado",
          grupo: { id: group.id, customerId, concept: group.concept, status: group.status, totalAmount: total },
          itemsAgregados: itemIds,
        },
      };
    });

    if (result.status >= 400) {
      notifyFail(
        "item_group.create_failed",
        result.body?.message || "Error creando grupo",
        { req, httpStatus: result.status },
      );
    } else {
      notifyOk("item_group.created", "Grupo de ítems creado", {
        groupId: result.body?.grupo?.id,
        customerId,
      });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("createItemGroup:", error);
    notifyFail("item_group.create_failed", "Error creando grupo", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error creando grupo", error: String(error?.message || error) });
  }
};

export const getFinanceWorkbenchAll = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);

    const result = await sequelize.transaction(async (t) => {
      // 1) Clientes + pedidos + items + producto
      const customers = await Customer.findAll({
        attributes: ["id", "name", "phone", "email", "cedula", "identType", "firstName", "secondName", "firstLastName", "secondLastName", "address"],
        include: [
          {
            model: Order,
            as: "ERP_orders",
            required: false,
            where: walkInPosOrderExcludeWhere(Op),
            attributes: ["id", "customerId", "date", "createdAt", "notes", "documentType"],
            include: [
              {
                model: OrderItem,
                as: "ERP_order_items",
                attributes: ["id", "orderId", "productId", "quantity", "price", "paidAt",      "soldQty",
                "damagedQty",
                "giftQty",
                "replacedQty",],
                include: [
                  {
                    model: InventoryProduct,
                    as: "ERP_inventory_product",
                    attributes: ["id", "name"],
                  },
                ],
              },
            ],
          },
        ],
        order: [
          ["name", "ASC"],
          [{ model: Order, as: "ERP_orders" }, "createdAt", "DESC"],
        ],
        transaction: t,
      });

      // 2) Grupos
      const groups = await ItemGroup.findAll({
        attributes: ["id", "customerId", "concept", "status", "totalAmount", "createdAt"],
        order: [["createdAt", "DESC"]],
        transaction: t,
      });

      // 3) Items de grupos (links)
      const groupItems = await ItemGroupItem.findAll({
        attributes: ["id", "groupId", "orderItemId"],
        transaction: t,
      });

      // ✅ Set: items agrupados
      const groupedItemIdSet = new Set(groupItems.map((x) => x.orderItemId));

      // ✅ Mapa: orderItemId -> groupId  (CLAVE para el frontend)
      const groupIdByItemId = new Map();
      for (const gi of groupItems) {
        groupIdByItemId.set(gi.orderItemId, gi.groupId);
      }

      // 4) Pagos/abonos de grupo
      const payments = await Payment.findAll({
        attributes: [
          "id",
          "groupId",
          "customerId",
          "date",
          "amount",
          "note",
          "method",
          "status",
          "createdAt",
        ],
        order: [["createdAt", "DESC"]],
        transaction: t,
      });

      // =========================
      // Formato EXACTO frontend
      // =========================

      // paidByGroupId (solo completed)
      const paidByGroupId = new Map();
      for (const p of payments) {
        if (p.status !== "completed") continue;
        const pg = Number(p.groupId);
        if (!Number.isFinite(pg)) continue;
        paidByGroupId.set(
          pg,
          Number(((paidByGroupId.get(pg) || 0) + toNum(p.amount)).toFixed(2))
        );
      }

      // Mapa groupId -> [orderItemId]
      const itemsByGroupId = new Map();
      for (const gi of groupItems) {
        const gid = Number(gi.groupId);
        if (!Number.isFinite(gid)) continue;
        if (!itemsByGroupId.has(gid)) itemsByGroupId.set(gid, []);
        itemsByGroupId.get(gid).push(gi.orderItemId);
      }

      // Mapa itemId -> total cobrable (misma lógica que payItemGroup: billable × price)
      const itemTotals = new Map();
      for (const c of customers) {
        const ordersArr = Array.isArray(c.ERP_orders) ? c.ERP_orders : [];
        for (const o of ordersArr) {
          const itemsArr = Array.isArray(o.ERP_order_items) ? o.ERP_order_items : [];
          for (const it of itemsArr) {
            const qty = toNum(it.quantity);
            const billable = Math.max(0, qty - toNum(it.damagedQty) - toNum(it.giftQty));
            const total = Number((billable * toNum(it.price)).toFixed(2));
            itemTotals.set(it.id, total);
          }
        }
      }

      const outGroups = groups.map((g) => {
        const itemIds = itemsByGroupId.get(Number(g.id)) || [];
        const totalCalc = Number(
          itemIds.reduce((sum, id) => sum + toNum(itemTotals.get(id) || 0), 0).toFixed(2)
        );

        const paid = toNum(paidByGroupId.get(Number(g.id)) || 0);
        const remaining = Number(Math.max(0, totalCalc - paid).toFixed(2));

        return {
          id: g.id,
          customerId: g.customerId,
          concept: g.concept,
          status: g.status,
          createdAt: isoDateOnly(g.createdAt),
          totalAmount: totalCalc, // ✅ siempre real (recalculado)
          paidAmount: paid,
          remainingAmount: remaining,
          itemsCount: itemIds.length,
        };
      });

      const outPayments = payments.map((p) => ({
        id: p.id,
        groupId: p.groupId,
        customerId: p.customerId,
        date: isoDateOnly(p.date) || isoDateOnly(p.createdAt),
        amount: Number(toNum(p.amount).toFixed(2)),
        note: p.note ?? "",
        method: p.method ?? "efectivo",
        status: p.status,
      }));

      // Deuda por cliente = (saldo de grupos abiertos) + (items no pagados y NO agrupados)
      const debtByCustomerId = new Map();

      // (a) saldo de grupos
      for (const g of outGroups) {
        if (g.status !== "open") continue;
        if (toNum(g.remainingAmount) <= 0) continue;
        debtByCustomerId.set(
          g.customerId,
          Number(((debtByCustomerId.get(g.customerId) || 0) + toNum(g.remainingAmount)).toFixed(2))
        );
      }

      // (b) items sin pagar y no agrupados
      for (const c of customers) {
        const ordersArr = Array.isArray(c.ERP_orders) ? c.ERP_orders : [];
        let ungroupedPending = 0;

        for (const o of ordersArr) {
          const itemsArr = Array.isArray(o.ERP_order_items) ? o.ERP_order_items : [];
          for (const it of itemsArr) {
            if (it.paidAt) continue;
            if (groupedItemIdSet.has(it.id)) continue; // ✅ ya está en grupo
            const qty = toNum(it.quantity);
            const billable = Math.max(0, qty - toNum(it.damagedQty) - toNum(it.giftQty));
            ungroupedPending += billable * toNum(it.price);
          }
        }

        if (ungroupedPending > 0) {
          debtByCustomerId.set(
            c.id,
            Number(((debtByCustomerId.get(c.id) || 0) + ungroupedPending).toFixed(2))
          );
        }
      }

      // customers
      let outCustomers = customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? null,
        email: c.email ?? null,
        cedula: c.cedula ?? null,
        identType: c.identType ?? null,
        firstName: c.firstName ?? null,
        secondName: c.secondName ?? null,
        firstLastName: c.firstLastName ?? null,
        secondLastName: c.secondLastName ?? null,
        address: c.address ?? null,
        debtTotal: Number(toNum(debtByCustomerId.get(c.id) || 0).toFixed(2)),
      }));

      outCustomers.sort((a, b) => {
        const diff = toNum(b.debtTotal) - toNum(a.debtTotal);
        if (diff !== 0) return diff;
        return String(a.name || "").localeCompare(String(b.name || ""), "es");
      });

      // orders (🔥 aquí va la corrección: itemGroupId real)
      const outOrders = [];
      for (const c of customers) {
        const ordersArr = Array.isArray(c.ERP_orders) ? c.ERP_orders : [];
        for (const o of ordersArr) {
          if (isWalkInPosOrder(o)) continue;
          const itemsArr = Array.isArray(o.ERP_order_items) ? o.ERP_order_items : [];
          outOrders.push({
            id: o.id,
            customerId: o.customerId ?? c.id,
            date: isoDateOnly(o.date) || isoDateOnly(o.createdAt),
            items: itemsArr.map((it) => {
              const gid = groupIdByItemId.get(it.id) || null;

              return {
                id: it.id,
                product: it.ERP_inventory_product?.name ?? "(sin nombre)",
                qty: toNum(it.quantity),
                price: toNum(it.price),
                paidAt: it.paidAt ? isoDateOnly(it.paidAt) : null,
                soldQty:toNum(it.soldQty),
                damagedQty:toNum(it.damagedQty),
                giftQty:toNum(it.giftQty),
                replacedQty:toNum(it.replacedQty),

                // ✅ IMPORTANTÍSIMO para el frontend
                inGroup: !!gid,
                itemGroupId: gid,
              };
            }),
          });
        }
      }

      await ensurePaymentScheduleSchema();
      const orderIds = outOrders.map((o) => o.id);
      const instMap = await loadCustomerInstallmentsMap(orderIds);

      for (const o of outOrders) {
        let total = 0;
        let unpaid = 0;
        for (const it of o.items || []) {
          const qty = toNum(it.qty ?? it.quantity);
          const billable = Math.max(0, qty - toNum(it.damagedQty) - toNum(it.giftQty));
          const line = Number((billable * toNum(it.price)).toFixed(2));
          total += line;
          if (!it.paidAt) unpaid += line;
        }
        total = Number(total.toFixed(2));
        unpaid = Number(unpaid.toFixed(2));
        const paidAmount = Number(Math.max(0, total - unpaid).toFixed(2));
        const raw = instMap.get(Number(o.id)) || [];
        const paymentInstallments = applyFifoPaidToInstallments(raw, paidAmount);
        const credit = summarizeNextCredit(paymentInstallments);
        o.totalAmount = total;
        o.paidAmount = paidAmount;
        o.remainingAmount = unpaid;
        o.paymentInstallments = paymentInstallments;
        o.paymentDueDate = credit.nextCreditDue
          ? credit.nextCreditDue
          : (paymentInstallments.at(-1)?.dueDate || null);
        o.nextCreditDue = credit.nextCreditDue;
        o.nextCreditAmount = credit.nextCreditAmount;
        o.pendingCreditCount = credit.pendingCreditCount;
      }

      // Enrich customers with soonest next credit among their orders that still have debt
      for (const c of outCustomers) {
        const custOrders = outOrders.filter((o) => Number(o.customerId) === Number(c.id) && toNum(o.remainingAmount) > 0.009);
        let best = null;
        let bestAmt = null;
        let count = 0;
        for (const o of custOrders) {
          if (o.nextCreditDue) {
            count += o.pendingCreditCount || 0;
            if (!best || String(o.nextCreditDue) < String(best)) {
              best = o.nextCreditDue;
              bestAmt = o.nextCreditAmount;
            }
          }
        }
        c.nextCreditDue = best;
        c.nextCreditAmount = bestAmt;
        c.pendingCreditCount = count;
      }

      return {
        customers: outCustomers,
        orders: outOrders,
        groups: outGroups,
        payments: outPayments,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("getFinanceWorkbenchAll:", error);
    return res.status(500).json({
      message: "Error al cargar Workbench",
      error: String(error?.message || error),
    });
  }
};

const itemBillableTotal = (it) => {
  const qty = toNum(it.quantity);
  const billable = Math.max(0, qty - toNum(it.damagedQty) - toNum(it.giftQty));
  return Number((billable * toNum(it.price)).toFixed(2));
};

/**
 * Resuelve (o crea) el grupo de cobranzas para abonar un pedido de cliente.
 * Misma idea que Cobranzas → «Abonar este pedido».
 */
async function resolveGroupForCustomerOrder(orderId, userAccountId, { createIfNeeded = true } = {}) {
  const order = await Order.findByPk(orderId, {
    include: [
      {
        model: OrderItem,
        as: "ERP_order_items",
        attributes: ["id", "orderId", "quantity", "price", "paidAt", "damagedQty", "giftQty"],
      },
      { model: Customer, as: "ERP_customer", attributes: ["id", "name"] },
    ],
  });
  if (!order) return { error: { status: 404, message: "Pedido no encontrado" } };

  const unpaid = (order.ERP_order_items || []).filter((it) => !it.paidAt);
  if (unpaid.length === 0) {
    return { error: { status: 400, message: "Este pedido no tiene ítems pendientes de cobro" } };
  }

  const unpaidIds = unpaid.map((it) => it.id);
  const orderUnpaidTotal = Number(
    unpaid.reduce((s, it) => s + itemBillableTotal(it), 0).toFixed(2)
  );

  const links = await ItemGroupItem.findAll({
    where: { orderItemId: { [Op.in]: unpaidIds } },
  });
  const groupIdByItem = new Map(links.map((l) => [l.orderItemId, l.groupId]));
  const ungroupedIds = unpaidIds.filter((id) => !groupIdByItem.has(id));
  const linkedGroupIds = [...new Set(links.map((l) => Number(l.groupId)))];

  const groups =
    linkedGroupIds.length > 0
      ? await ItemGroup.findAll({ where: { id: { [Op.in]: linkedGroupIds } } })
      : [];
  const openGroups = groups.filter((g) => g.status === "open");

  const concept = `Pedido #${order.id}`;

  if (ungroupedIds.length === 0) {
    if (openGroups.length === 1) {
      const fin = await getGroupFinancials(openGroups[0].id, null);
      return {
        order,
        groupId: openGroups[0].id,
        created: false,
        orderUnpaidTotal,
        groupRemaining: fin?.remaining ?? 0,
        groupTotal: fin?.total ?? 0,
        groupPaid: fin?.paid ?? 0,
        concept: openGroups[0].concept || concept,
      };
    }
    if (openGroups.length === 0) {
      return {
        error: {
          status: 400,
          message:
            "Los ítems pendientes están en grupos cerrados. Revisa el pedido en Cobranzas.",
        },
      };
    }
    return {
      error: {
        status: 400,
        message:
          "Este pedido está repartido en varios grupos abiertos. Únelos o abona desde Cobranzas.",
      },
    };
  }

  // Hay ítems sin grupo
  if (openGroups.length > 1) {
    return {
      error: {
        status: 400,
        message:
          "Hay ítems sin grupo y otros en varios grupos. Organízalos en Cobranzas y luego abona.",
      },
    };
  }

  if (!createIfNeeded) {
    let suggested = orderUnpaidTotal;
    let groupId = null;
    let groupRemaining = null;
    if (openGroups.length === 1) {
      const fin = await getGroupFinancials(openGroups[0].id, null);
      groupId = openGroups[0].id;
      groupRemaining = Number(
        ((fin?.remaining || 0) +
          ungroupedIds.reduce(
            (s, id) => s + itemBillableTotal(unpaid.find((u) => u.id === id)),
            0
          )).toFixed(2)
      );
      suggested = groupRemaining;
    } else {
      suggested = Number(
        ungroupedIds
          .reduce((s, id) => s + itemBillableTotal(unpaid.find((u) => u.id === id)), 0)
          .toFixed(2)
      );
    }
    return {
      order,
      groupId,
      created: false,
      willCreate: openGroups.length === 0,
      willAddToGroup: openGroups.length === 1,
      ungroupedIds,
      orderUnpaidTotal,
      groupRemaining: groupRemaining ?? suggested,
      suggestedAmount: suggested,
      concept: openGroups[0]?.concept || concept,
    };
  }

  if (openGroups.length === 1) {
    await ItemGroupItem.bulkCreate(
      ungroupedIds.map((orderItemId) => ({
        groupId: openGroups[0].id,
        orderItemId,
      }))
    );
    const fin = await getGroupFinancials(openGroups[0].id, null);
    return {
      order,
      groupId: openGroups[0].id,
      created: false,
      addedItemIds: ungroupedIds,
      orderUnpaidTotal,
      groupRemaining: fin?.remaining ?? 0,
      groupTotal: fin?.total ?? 0,
      groupPaid: fin?.paid ?? 0,
      concept: openGroups[0].concept || concept,
    };
  }

  // Crear grupo solo con ítems sin grupo de este pedido
  const snapshotTotal = Number(
    ungroupedIds
      .reduce((s, id) => s + itemBillableTotal(unpaid.find((u) => u.id === id)), 0)
      .toFixed(2)
  );
  const group = await ItemGroup.create({
    customerId: order.customerId,
    concept,
    status: "open",
    totalAmount: snapshotTotal,
    createdBy: userAccountId,
  });
  await ItemGroupItem.bulkCreate(
    ungroupedIds.map((orderItemId) => ({ groupId: group.id, orderItemId }))
  );

  return {
    order,
    groupId: group.id,
    created: true,
    addedItemIds: ungroupedIds,
    orderUnpaidTotal,
    groupRemaining: snapshotTotal,
    groupTotal: snapshotTotal,
    groupPaid: 0,
    concept,
  };
}

/** Resumen para abonar un pedido desde el calendario (sin crear grupo aún). */
export const getCustomerOrderCollectionSummary = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);
    const orderId = Number(req.params.orderId);
    if (!Number.isFinite(orderId)) {
      return res.status(400).json({ message: "Pedido inválido" });
    }

    const resolved = await resolveGroupForCustomerOrder(orderId, null, {
      createIfNeeded: false,
    });
    if (resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    return res.json({
      orderId,
      customerId: resolved.order.customerId,
      customerName: resolved.order.ERP_customer?.name || null,
      concept: resolved.concept,
      groupId: resolved.groupId,
      willCreate: Boolean(resolved.willCreate),
      willAddToGroup: Boolean(resolved.willAddToGroup),
      ungroupedIds: resolved.ungroupedIds || [],
      orderUnpaidTotal: resolved.orderUnpaidTotal,
      suggestedAmount: resolved.suggestedAmount ?? resolved.groupRemaining ?? 0,
      groupRemaining: resolved.groupRemaining ?? resolved.suggestedAmount ?? 0,
      canQuickPay: true,
    });
  } catch (error) {
    console.error("getCustomerOrderCollectionSummary:", error);
    return res.status(500).json({
      message: "Error al cargar resumen de cobro del pedido",
      error: String(error?.message || error),
    });
  }
};

/**
 * Abonar un pedido de cliente desde el calendario:
 * crea/usa grupo de Cobranzas y registra el Payment + Income.
 */
export const payCustomerOrder = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const orderId = Number(req.params.orderId);
    if (!Number.isFinite(orderId)) {
      notifyFail("workbench.order_paid_failed", "Pedido inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Pedido inválido" });
    }

    const resolved = await resolveGroupForCustomerOrder(orderId, user.accountId, {
      createIfNeeded: true,
    });
    if (resolved.error) {
      notifyFail("workbench.order_paid_failed", resolved.error.message, {
        req,
        httpStatus: resolved.error.status,
        extra: { orderId },
      });
      return res.status(resolved.error.status).json({ message: resolved.error.message });
    }

    const noteExtra = req.body?.note;
    const pedidoNote =
      noteExtra && String(noteExtra).trim()
        ? String(noteExtra).trim()
        : `Abono pedido #${orderId}`;

    req.raptorNotify = {
      ok: "workbench.order_paid",
      fail: "workbench.order_paid_failed",
      okName: `Cobro pedido #${orderId}`,
    };
    req.params.groupId = String(resolved.groupId);
    req.body = {
      ...(req.body || {}),
      note: pedidoNote,
    };

    return payItemGroup(req, res);
  } catch (error) {
    console.error("payCustomerOrder:", error);
    notifyFail("workbench.order_paid_failed", "Error al abonar el pedido", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: "Error al abonar el pedido",
      error: String(error?.message || error),
    });
  }
};

