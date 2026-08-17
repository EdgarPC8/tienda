/**
 * Importa todos los modelos Sequelize de EdDeli para que `sequelize.sync`
 * conozca todas las tablas (p. ej. al recargar BD).
 */
import "../models/Account.js";
import "../models/Users.js";
import "../models/Roles.js";
import "../models/Notifications.js";
import "../models/NotificationProgram.js";
import "../models/Inventory.js";
import "../models/Orders.js";
import "../models/Finance.js";
import "../models/Editor.js";
import "../models/CashShift.js";
import "../models/CashRegister.js";
import "../models/CashShiftMovement.js";
import "../models/StoreStock.js";
import "../models/Tasks.js";
import "../models/Publicidad.js";
import "../models/MarketingPromotions.js";
import "../models/MediaAsset.js";
import "../models/DocumentAttachment.js";
import "../models/License.js";
import "../models/Logs.js";
import "../models/UserData.js";
import "../models/AppSettings.js";
import "../models/SriBilling.js";
import "../models/AppEntitlement.js";
