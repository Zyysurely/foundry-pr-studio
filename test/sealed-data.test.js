import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNotExpired,
  sealData,
  unsealData,
} from "../lib/sealed-data.js";

const SECRET = "test-session-secret-that-is-long-enough";

test("sealed data round trips", () => {
  const value = {
    kind: "oauth-state",
    installationId: "123",
    expiresAt: Date.now() + 60_000,
  };

  const token = sealData(value, SECRET);
  const result = unsealData(token, SECRET);

  assert.deepEqual(result, value);
});

test("sealed data rejects a different secret", () => {
  const token = sealData({ value: "test" }, SECRET);

  assert.throws(
    () => unsealData(token, "different-session-secret-that-is-long"),
    /state is invalid/,
  );
});

test("expired values are rejected", () => {
  assert.throws(
    () => assertNotExpired({ expiresAt: Date.now() - 1 }),
    /session expired/,
  );
});
