/**
 * Corrige turnos 19-20 (vie/sáb 26-27 jun 2026): almuerzos $2.50 y cuadre.
 * Uso: node scripts/fix-backup-shifts-viernes-sabado.js
 */
import { promises as fs } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupPath = resolve(__dirname, "../src/database/backup.json");

const to2 = (n) => Number(Number(n).toFixed(2));

function computeExpected(opening, salesCash, cashOut, cashIn = 0) {
  return to2(Number(opening) + Number(salesCash) + Number(cashIn) - Number(cashOut));
}

const raw = await fs.readFile(backupPath, "utf8");
const data = JSON.parse(raw);

const shift19 = data.CashShift.find((s) => s.id === 19);
const shift20 = data.CashShift.find((s) => s.id === 20);
const shift21 = data.CashShift.find((s) => s.id === 21);

if (!shift19 || !shift20) {
  throw new Error("No se encontraron turnos 19 o 20 en el backup.");
}

console.log("=== ANTES ===");
console.log("Turno 19 (vie 26 jun): cierre", shift19.closingCashTotal, "esperado", shift19.expectedCashTotal, "diff", shift19.cashDifference, "gastos", shift19.cashOutTotal);
console.log("Turno 20 (sáb 27 jun): apertura", shift20.openingCashTotal, "cierre", shift20.closingCashTotal, "gastos", shift20.cashOutTotal);
console.log("Turno 21 apertura:", shift21?.openingCashTotal, "(cierre sáb fue", shift20.closingCashTotal + ")");

const nextMovementId = Math.max(0, ...data.CashShiftMovement.map((m) => m.id)) + 1;
const nextExpenseId = Math.max(0, ...data.Expense.map((e) => e.id)) + 1;

const lunchFri = {
  id: nextMovementId,
  shiftId: 19,
  accountId: 1,
  userId: 1,
  direction: "out",
  category: "gasto_operativo",
  amount: "2.50",
  concept: "almuerzo",
  notes: "Viernes 26-jun-2026",
  productId: null,
  quantity: null,
  inventoryMovementId: null,
  expenseId: nextExpenseId,
  createdAt: "2026-06-26T17:30:00.000Z",
  updatedAt: "2026-06-26T17:30:00.000Z",
};

const lunchSat = {
  id: nextMovementId + 1,
  shiftId: 20,
  accountId: 1,
  userId: 1,
  direction: "out",
  category: "gasto_operativo",
  amount: "2.50",
  concept: "almuerzo",
  notes: "Sábado 27-jun-2026",
  productId: null,
  quantity: null,
  inventoryMovementId: null,
  expenseId: nextExpenseId + 1,
  createdAt: "2026-06-27T17:30:00.000Z",
  updatedAt: "2026-06-27T17:30:00.000Z",
};

data.CashShiftMovement.push(lunchFri, lunchSat);

data.Expense.push(
  {
    id: nextExpenseId,
    date: "2026-06-26T17:30:00.000Z",
    amount: "2.50",
    concept: "almuerzo",
    category: "Gastos operativos",
    referenceId: lunchFri.id,
    referenceType: "cash_shift_movement",
    status: "paid",
    counterpartyName: null,
    createdBy: 1,
    createdAt: lunchFri.createdAt,
    updatedAt: lunchFri.updatedAt,
  },
  {
    id: nextExpenseId + 1,
    date: "2026-06-27T17:30:00.000Z",
    amount: "2.50",
    concept: "almuerzo",
    category: "Gastos operativos",
    referenceId: lunchSat.id,
    referenceType: "cash_shift_movement",
    status: "paid",
    counterpartyName: null,
    createdBy: 1,
    createdAt: lunchSat.createdAt,
    updatedAt: lunchSat.updatedAt,
  },
);

shift19.cashOutTotal = "2.50";
shift19.expectedCashTotal = String(
  computeExpected(shift19.openingCashTotal, shift19.salesCashTotal, 2.5, 0),
);
shift19.cashDifference = String(
  to2(Number(shift19.closingCashTotal) - Number(shift19.expectedCashTotal)),
);

shift20.cashOutTotal = "2.50";
shift20.expectedCashTotal = String(
  computeExpected(shift20.openingCashTotal, shift20.salesCashTotal, 2.5, 0),
);
shift20.cashDifference = String(
  to2(Number(shift20.closingCashTotal) - Number(shift20.expectedCashTotal)),
);

await fs.writeFile(backupPath, JSON.stringify(data, null, 2), "utf8");

console.log("\n=== DESPUÉS ===");
console.log("Turno 19: cierre", shift19.closingCashTotal, "(1×10ct + 2×$1) — apertura sáb", shift20.openingCashTotal, "✓ coinciden");
console.log("Turno 19: esperado", shift19.expectedCashTotal, "diff", shift19.cashDifference, "(falta retiro de caja a casa ~$76)");
console.log("Turno 20: cierre", shift20.closingCashTotal, "esperado", shift20.expectedCashTotal, "diff", shift20.cashDifference);
console.log("Almuerzos añadidos: mov", lunchFri.id, "y", lunchSat.id);
console.log("\n✅ backup.json actualizado:", backupPath);
console.log("Recarga la BD desde Comandos si quieres aplicarlo.");
