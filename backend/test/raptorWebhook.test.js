import test from "node:test";
import assert from "node:assert/strict";
import { resolveWebhookEvent } from "../src/events/webhookEventCatalog.js";

test("resolveWebhookEvent mapea crear pedido", () => {
  const req = {
    method: "POST",
    originalUrl: "/eddeliapi/orders",
    params: {},
    query: {},
    body: { customerId: 1 },
    user: { accountId: 2, userId: 3, loginRol: "Administrador" },
  };
  const event = resolveWebhookEvent(req, { id: 1042 });
  assert.equal(event.type_key, "order.created");
  assert.equal(event.name, "Pedido #1042");
  assert.equal(event.metadata.body.customerId, 1);
});

test("resolveWebhookEvent mapea crear usuario", () => {
  const req = {
    method: "POST",
    originalUrl: "/eddeliapi/users",
    params: {},
    query: {},
    body: { firstName: "Ana" },
    user: null,
  };
  const event = resolveWebhookEvent(req, { user: { id: 7 } });
  assert.equal(event.type_key, "user.created");
  assert.ok(event.name.startsWith("Usuario"));
});

test("resolveWebhookEvent omite campos sensibles en metadata", () => {
  const req = {
    method: "POST",
    originalUrl: "/eddeliapi/account",
    params: {},
    query: {},
    body: { username: "admin", password: "secret", newPassword: "x" },
    user: null,
  };
  const event = resolveWebhookEvent(req, {});
  assert.equal(event.metadata.body.username, "admin");
  assert.equal(event.metadata.body.password, undefined);
  assert.equal(event.metadata.body.newPassword, undefined);
});
