import "dotenv/config";
import { saveBackup } from "../src/database/insertData.js";

const result = await saveBackup({ updateMainBackup: true });
console.log("Filas:", result.counts);
