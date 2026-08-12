import test from "node:test";
import assert from "node:assert/strict";

/**
 * Lógica de validación de changeRole (espejo del controlador).
 */
function validateChangeRoleRequest(req, body) {
  const { accountId, rolId } = body;
  if (!accountId || !rolId) {
    return { ok: false, status: 400, message: "accountId y rolId son obligatorios" };
  }
  if (Number(accountId) !== Number(req.user?.accountId)) {
    return { ok: false, status: 403, message: "No puedes cambiar el rol de otra cuenta" };
  }
  return { ok: true };
}

test("changeRole: rechaza accountId ajeno", () => {
  const result = validateChangeRoleRequest(
    { user: { accountId: 5 } },
    { accountId: 99, rolId: 2 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("changeRole: acepta accountId de la sesión", () => {
  const result = validateChangeRoleRequest(
    { user: { accountId: 5 } },
    { accountId: 5, rolId: 2 },
  );
  assert.equal(result.ok, true);
});

test("changeRole: exige accountId y rolId", () => {
  const result = validateChangeRoleRequest({ user: { accountId: 1 } }, { accountId: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
