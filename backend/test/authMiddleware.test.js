import test from "node:test";
import assert from "node:assert/strict";
import {
  requireAdminOrProgrammer,
  requireOwner,
  requireProgrammer,
} from "../src/middlewares/authMiddelware.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test("requireOwner: permite Propietario", () => {
  const req = { user: { loginRol: "Propietario" } };
  const res = mockRes();
  let nextCalled = false;
  requireOwner(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("requireOwner: rechaza Programador", () => {
  const req = { user: { loginRol: "Programador" } };
  const res = mockRes();
  let nextCalled = false;
  requireOwner(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("requireProgrammer: permite Programador", () => {
  const req = { user: { loginRol: "Programador" } };
  const res = mockRes();
  let nextCalled = false;
  requireProgrammer(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("requireProgrammer: rechaza Propietario", () => {
  const req = { user: { loginRol: "Propietario" } };
  const res = mockRes();
  let nextCalled = false;
  requireProgrammer(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("requireAdminOrProgrammer: permite Administrador", () => {
  const req = { user: { loginRol: "Administrador" } };
  const res = mockRes();
  let nextCalled = false;
  requireAdminOrProgrammer(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("requireAdminOrProgrammer: permite Programador", () => {
  const req = { user: { loginRol: "Programador" } };
  const res = mockRes();
  let nextCalled = false;
  requireAdminOrProgrammer(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("requireAdminOrProgrammer: rechaza Empleado", () => {
  const req = { user: { loginRol: "Empleado" } };
  const res = mockRes();
  let nextCalled = false;
  requireAdminOrProgrammer(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});
