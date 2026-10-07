import {
  ensurePeerSyncSchema,
  pushClientOrderToPeer,
  pushSupplierOrderToPeer,
  receivePeerSupplierOrder,
  receivePeerCustomerOrder,
  acceptPeerSupplierOrder,
  acceptPeerCustomerOrder,
  getPeerAcceptOrderDetail,
  getPeerAcceptCustomerOrderDetail,
  getPeerOrderStatusBySource,
  applyRemotePeerAcceptStatus,
} from "../../services/supplierPeerSyncService.js";
import { Customer } from "../../models/Orders.js";

function extractBearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/** POST /orders/peer-sync/supplier-orders — inbound desde el sistema par. */
export const receivePeerSupplierOrderHandler = async (req, res) => {
  try {
    await ensurePeerSyncSchema();
    const secret = extractBearer(req) || req.body?.secret;
    const result = await receivePeerSupplierOrder({
      secret,
      supplierId: req.body?.supplierId,
      sourceApp: req.body?.sourceApp,
      sourceOrderId: req.body?.sourceOrderId,
      date: req.body?.date,
      notes: req.body?.notes,
      items: req.body?.items || [],
    });
    return res.status(result.reused ? 200 : 201).json(result);
  } catch (error) {
    console.error("receivePeerSupplierOrder:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al recibir pedido del sistema par",
    });
  }
};

/** POST /orders/peer-sync/customer-orders — inbound pedido proveedor → cliente. */
export const receivePeerCustomerOrderHandler = async (req, res) => {
  try {
    await ensurePeerSyncSchema();
    const secret = extractBearer(req) || req.body?.secret;
    const result = await receivePeerCustomerOrder({
      secret,
      sourceApp: req.body?.sourceApp,
      sourceOrderId: req.body?.sourceOrderId,
      date: req.body?.date,
      notes: req.body?.notes,
      items: req.body?.items || [],
    });
    return res.status(result.reused ? 200 : 201).json(result);
  } catch (error) {
    console.error("receivePeerCustomerOrder:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al recibir pedido cliente del sistema par",
    });
  }
};

/** GET /orders/peer-sync/status — estado de aceptación del pedido peer. */
export const getPeerOrderStatusHandler = async (req, res) => {
  try {
    const secret = extractBearer(req) || req.query?.secret;
    const result = await getPeerOrderStatusBySource({
      secret,
      kind: req.query?.kind,
      sourceApp: req.query?.sourceApp,
      sourceOrderId: req.query?.sourceOrderId,
    });
    return res.json(result);
  } catch (error) {
    console.error("getPeerOrderStatus:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al consultar estado peer",
    });
  }
};

/** POST /orders/peer-sync/accept-status — ack de aceptación hacia el origen. */
export const applyPeerAcceptStatusHandler = async (req, res) => {
  try {
    const secret = extractBearer(req) || req.body?.secret;
    const result = await applyRemotePeerAcceptStatus({
      secret,
      originKind: req.body?.originKind,
      sourceOrderId: req.body?.sourceOrderId,
      peerAcceptStatus: req.body?.peerAcceptStatus,
      remoteOrderId: req.body?.remoteOrderId,
    });
    return res.json(result);
  } catch (error) {
    console.error("applyPeerAcceptStatus:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al guardar estado de aceptación peer",
    });
  }
};

/** POST /orders/:id/push-to-peer — envía pedido cliente al otro sistema. */
export const pushOrderToPeerHandler = async (req, res) => {
  try {
    const result = await pushClientOrderToPeer(req.params.id);
    return res.json({
      message: result?.message || "Pedido enviado al sistema del proveedor/cliente enlazado",
      ...result,
    });
  } catch (error) {
    console.error("pushOrderToPeer:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al enviar el pedido al sistema par",
    });
  }
};

/** POST /orders/supplier-orders/:id/push-to-peer — envía pedido proveedor → cliente remoto. */
export const pushSupplierOrderToPeerHandler = async (req, res) => {
  try {
    const result = await pushSupplierOrderToPeer(req.params.id);
    return res.json({
      message: result?.message || "Pedido enviado al sistema enlazado como pedido de cliente",
      ...result,
    });
  } catch (error) {
    console.error("pushSupplierOrderToPeer:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al enviar el pedido a proveedor al sistema par",
    });
  }
};

/** GET /orders/supplier-orders/:id/peer-accept — detalle para modal. */
export const getPeerAcceptOrderHandler = async (req, res) => {
  try {
    const detail = await getPeerAcceptOrderDetail(req.params.id);
    return res.json(detail);
  } catch (error) {
    console.error("getPeerAcceptOrder:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al cargar pedido peer",
    });
  }
};

/** POST /orders/supplier-orders/:id/peer-accept — aceptar y enlazar. */
export const acceptPeerSupplierOrderHandler = async (req, res) => {
  try {
    const result = await acceptPeerSupplierOrder(req.params.id, req.body?.mappings || []);
    return res.json(result);
  } catch (error) {
    console.error("acceptPeerSupplierOrder:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al aceptar el pedido",
    });
  }
};

/** GET /orders/:id/peer-accept — detalle pedido cliente peer. */
export const getPeerAcceptCustomerOrderHandler = async (req, res) => {
  try {
    const detail = await getPeerAcceptCustomerOrderDetail(req.params.id);
    return res.json(detail);
  } catch (error) {
    console.error("getPeerAcceptCustomerOrder:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al cargar pedido cliente peer",
    });
  }
};

/** POST /orders/:id/peer-accept — aceptar pedido cliente peer. */
export const acceptPeerCustomerOrderHandler = async (req, res) => {
  try {
    const result = await acceptPeerCustomerOrder(req.params.id, req.body?.mappings || []);
    return res.json(result);
  } catch (error) {
    console.error("acceptPeerCustomerOrder:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Error al aceptar el pedido cliente",
    });
  }
};

/** PUT /orders/customers/:id/peer-link — solo elige sistema (URL/secreto fijos en código). */
export const updateCustomerPeerLinkHandler = async (req, res) => {
  try {
    await ensurePeerSyncSchema();
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) return res.status(404).json({ message: "Cliente no encontrado" });

    const body = req.body || {};
    const remoteApp = body.remoteApp !== undefined
      ? (String(body.remoteApp || "").trim().toLowerCase() || null)
      : customer.remoteApp;
    await customer.update({
      remoteApp,
      remoteBaseUrl: null,
      remoteSyncSecret: null,
      remoteSupplierId: null,
    });
    const reloaded = await customer.reload();
    return res.json(reloaded);
  } catch (error) {
    console.error("updateCustomerPeerLink:", error);
    return res.status(500).json({ message: "Error al guardar enlace del cliente" });
  }
};
