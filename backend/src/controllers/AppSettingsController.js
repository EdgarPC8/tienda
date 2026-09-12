import {
  loadAppSettings,
  toPublicSettings,
  updateAppSettings,
  ensureStandardAssetDirs,
  getAppSettingsSync,
} from "../services/appSettingsService.js";
import { getTimeStatus } from "../services/timeStatusService.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";
import { unifyStockToSingleLocal, linkStoreToSriBilling } from "../services/storeStockService.js";

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
      "principalStoreId",
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
      // Store/Tienda: un solo local. Multistock solo aplica en EdDeli (gestor).
      const wantOn = asBool(patch.multiStockEnabled, false);
      const currentOn = asBool(getAppSettingsSync()?.multiStockEnabled, false);

      if (wantOn) {
        notifyFail(
          "app.settings_update_failed",
          "Multistock no disponible en esta instalación",
          {
            req,
            httpStatus: 403,
            extra: { reason: "multi_stock_not_supported" },
          },
        );
        return res.status(403).json({
          message:
            "Esta instalación opera con un solo local. Varios locales (multistock) no está disponible.",
        });
      }

      if (!wantOn && currentOn) {
        const principalRaw = b.principalStoreId;
        const principalStoreId =
          principalRaw != null && principalRaw !== ""
            ? Number(principalRaw)
            : null;
        try {
          const unified = await unifyStockToSingleLocal({
            principalStoreId:
              Number.isFinite(principalStoreId) && principalStoreId > 0
                ? principalStoreId
                : undefined,
          });
          if (unified?.principalStoreId) {
            patch.principalStoreId = unified.principalStoreId;
          }
          notifyOk("app.multistock_unified", "Stock unificado en un solo local", {
            req,
            extra: unified,
          });
        } catch (err) {
          console.error("unifyStockToSingleLocal", err);
          notifyFail("app.settings_update_failed", "No se pudo unificar el stock", {
            error: err,
            req,
            httpStatus: 400,
            extra: { reason: "multi_stock_unify_failed" },
          });
          return res.status(400).json({
            message: err.message || "No se pudo unificar el stock en un solo local.",
          });
        }
      }

      patch.multiStockEnabled = false;
    }

    if ("principalStoreId" in b && patch.principalStoreId == null) {
      const rawId = b.principalStoreId;
      const sid =
        rawId != null && rawId !== "" ? Number(rawId) : null;
      patch.principalStoreId =
        Number.isFinite(sid) && sid > 0 ? Math.floor(sid) : null;
    }

    const data = await updateAppSettings(patch);

    if (patch.principalStoreId) {
      try {
        await linkStoreToSriBilling(patch.principalStoreId, {
          syncDirection: "store_to_sri",
        });
      } catch (err) {
        console.warn("[appSettings] linkStoreToSriBilling:", err?.message || err);
      }
    }

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
