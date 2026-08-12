import test from "node:test";
import assert from "node:assert/strict";
import { parsePagination, unwrapListPayload } from "../src/utils/pagination.js";

test("parsePagination: valores por defecto", () => {
  const p = parsePagination({ query: {} });
  assert.equal(p.all, false);
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 50);
  assert.equal(p.offset, 0);
  assert.equal(p.limit, 50);
});

test("parsePagination: all=true", () => {
  const p = parsePagination({ query: { all: "true" } });
  assert.equal(p.all, true);
});

test("parsePagination: page y pageSize personalizados", () => {
  const p = parsePagination({ query: { page: "3", pageSize: "25" } });
  assert.equal(p.page, 3);
  assert.equal(p.pageSize, 25);
  assert.equal(p.offset, 50);
});

test("parsePagination: respeta maxPageSize", () => {
  const p = parsePagination({ query: { pageSize: "9999" } }, { maxPageSize: 200 });
  assert.equal(p.pageSize, 200);
});

test("unwrapListPayload: array legacy", () => {
  assert.deepEqual(unwrapListPayload([1, 2]), [1, 2]);
});

test("unwrapListPayload: respuesta paginada", () => {
  assert.deepEqual(unwrapListPayload({ data: [3], total: 1 }), [3]);
});

test("unwrapListPayload: productos con tierGroups", () => {
  assert.deepEqual(unwrapListPayload({ products: [{ id: 1 }], tierGroups: [] }), [{ id: 1 }]);
});
