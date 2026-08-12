import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

/**
 * Entitlement local (suscripción/plan/módulos) empujado por el gestor.
 * Una sola fila (id=1): la app no depende del gestor en runtime.
 */
export const AppEntitlement = sequelize.define(
  "app_entitlements",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    /** Copia del payload del gestor (mismo shape que /subscriptions/check). */
    payload: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: { subscribed: false, subscription: null, maintenance: false },
    },
    /** Origen: gestor_push | gestor_pull | manual */
    source: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "gestor_push",
    },
    syncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "synced_at",
    },
  },
  { timestamps: true },
);
