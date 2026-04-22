import Sequelize from "sequelize";

/**
 * Base `tienda` — créala antes en MySQL:
 *   CREATE DATABASE tienda CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 * Las tablas se crean al arrancar el servidor (sequelize.sync en index.js).
 */
const sequelize = new Sequelize("tienda", "root", "", {
  host: "localhost",
  dialect: "mysql",
  timezone: "-05:00",
});

export { sequelize };
