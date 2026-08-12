import { sequelize } from "../src/database/connection.js";

try {
  const [found] = await sequelize.query(
    "SHOW COLUMNS FROM `ERP_orders` LIKE 'sellerAccountId'",
  );
  if (!Array.isArray(found) || found.length === 0) {
    await sequelize.query(
      "ALTER TABLE `ERP_orders` ADD COLUMN `sellerAccountId` INT NULL",
    );
    console.log("COLUMN_ADDED");
  } else {
    console.log("COLUMN_EXISTS");
  }
} catch (e) {
  console.error("ERR", e?.message || e);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
