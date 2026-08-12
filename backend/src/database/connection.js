/**
 * Conexión Sequelize → MySQL
 *
 * Variables de entorno (crear backend/.env en servidor; ver .env.example):
 *   DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT
 *
 * Si no hay .env, usa los valores por defecto de desarrollo local.
 */
import Sequelize from "sequelize";

const DB_NAME = process.env.DB_NAME || "store";
const DB_USER = process.env.DB_USER || "root";
const DB_PASS = process.env.DB_PASS ?? "";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: "mysql",
  timezone: "-05:00",
  logging: process.env.DB_LOGGING === "1" ? console.log : false,
  // Muchas peticiones en paralelo; el default (max≈5) las encola ~10–20s.
  pool: {
    max: Number(process.env.DB_POOL_MAX || 25),
    min: Number(process.env.DB_POOL_MIN || 2),
    acquire: Number(process.env.DB_POOL_ACQUIRE || 60000),
    idle: Number(process.env.DB_POOL_IDLE || 10000),
  },
});

export { sequelize };
