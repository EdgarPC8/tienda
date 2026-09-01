import {
  loadAppSettings,
  toPublicSettings,
  updateAppSettings,
  ensureStandardAssetDirs,
  getAppSettingsSync,
} from "../services/appSettingsService.js";
import { getTimeStatus } from "../services/timeStatusService.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";
import { getFeatureGate } from "../services/entitlementService.js";

const IANA_TIMEZONE_RE = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/;

function asBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(s)) return false;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  return fallback;
}

export async function getAppSettings(req, res) {
  try {
    const data = await loadAppSettings();
    res.json(toPublicSettings(data));
  } catch (err) {
    console.error("getAppSettings", err);
    res.status(500).json({ message: "No se pudo cargar la configuración" });
  }
}

export async function putAppSettings(req, res) {
  try {
    const b = req.body || {};
    const allowed = [
      "name",
      "alias",
      "version",
      "description",
      "author",
      "logoPath",
      "iconPath",
      "phone",
      "socialWhatsapp",
      "socialFacebook",
      "socialInstagram",
      "socialTiktok",
      "socialEmail",
      "mediaFolderPrefix",
      "cajaQuickCategoryMatch",
      "walkInCustomerLabel",
      "timezone",
      "showPublicCatalog",
      "showPublicStoresPropia",
      "showPublicStoresVitrina",
      "multiStockEnabled",
      "showProductCostInSelect",
      "moneyDisplayDecimals",
      "moneyRoundingMode",
      "ordersAllowDeliverStockAdjust",
      "financeAllowAdminCorrections",
      "suggestOpenPackOnPosShortage",
      "cajaAllowCreateProductFromSelect",
      "cajaAllowCreateProductFromScan",
      "cajaAllowEditProductFromCart",
      "cajaSuggestUpdateProductPrice",
      "cajaAllowPercentDiscount",
      "notificationsToastGreeting",
      "notificationsToastStock",
      "notificationsToastCredit",
      "notificationsToastExpiry",
      "notificationsCreditEnabled",
      "notificationsExpiryEnabled",
      "receiptDetailSettings",
      "themePalette",
      "keyboardShortcuts",
    ];
    const patch = {};
    for (const key of allowed) {
      if (b[key] !== undefined) patch[key] = b[key];
    }
    if (patch.timezone != null) {
      const tz = String(patch.timezone).trim();
      if (!IANA_TIMEZONE_RE.test(tz)) {
        notifyFail("app.settings_update_failed", "Zona horaria IANA inválida", {
          req,
          httpStatus: 400,
          extra: { reason: "invalid_timezone", timezone: tz },
        });
        return res.status(400).json({ message: "Zona horaria IANA inválida (ej. America/Guayaquil)" });
      }
      patch.timezone = tz;
    }
    if (patch.mediaFolderPrefix != null) {
      patch.mediaFolderPrefix = String(patch.mediaFolderPrefix).trim().replace(/\/+$/, "") || "app";
      ensureStandardAssetDirs(patch.mediaFolderPrefix);
    }

    if ("multiStockEnabled" in patch) {
      const wantOn = asBool(patch.multiStockEnabled, false);
      const currentOn = asBool(getAppSettingsSync()?.multiStockEnabled, false);
      const isProgrammer = req.user?.loginRol === "Programador";

      if (wantOn && !currentOn) {
        const gate = await getFeatureGate("multi_stock");
        if (gate.present) {
          const ok =
            gate.status === "active" ||
            (gate.status === "developer" && isProgrammer);
          if (!ok) {
            notifyFail(
              "app.settings_update_failed",
              "Multistock no desbloqueado por el gestor",
              {
                req,
                httpStatus: 403,
                extra: { reason: "multi_stock_locked", status: gate.status },
              },
            );
            return res.status(403).json({
              message:
                "Multistock / varios locales aún no está desbloqueado para esta instalación.",
            });
          }
        }
      }

      if (!wantOn && currentOn && !isProgrammer) {
        notifyFail(
          "app.settings_update_failed",
          "No se puede desactivar multistock una vez activado",
          {
            req,
            httpStatus: 403,
            extra: { reason: "multi_stock_irreversible" },
          },
        );
        return res.status(403).json({
          message:
            "Una vez activado el multistock no se puede volver a un solo local. Contactá soporte si necesitás ayuda.",
        });
      }

      patch.multiStockEnabled = wantOn;
    }

    const data = await updateAppSettings(patch);
    notifyOk("app.settings_updated", "Configuración app actualizada", {
      settings: toPublicSettings(data),
    });
    res.json({ message: "Configuración actualizada", settings: toPublicSettings(data) });
  } catch (err) {
    console.error("putAppSettings", err);
    notifyFail("app.settings_update_failed", "No se pudo guardar la configuración", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "No se pudo guardar la configuración" });
  }
}

export async function getAppTimeStatus(req, res) {
  try {
    const status = await getTimeStatus();
    res.json(status);
  } catch (err) {
    console.error("getAppTimeStatus", err);
    res.status(500).json({ message: "No se pudo obtener el estado del reloj" });
  }
}
