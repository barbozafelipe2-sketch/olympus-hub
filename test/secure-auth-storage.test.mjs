import assert from "node:assert/strict";
import test from "node:test";

import { createSecureAuthStorage } from "../mobile/src/lib/secure-auth-storage.ts";

function memoryStorage({ beforeSet } = {}) {
  const values = new Map();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      await beforeSet?.(key, value);
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

test("secure auth storage round-trips large UTF-8 sessions in bounded chunks", async () => {
  const secure = memoryStorage();
  const legacy = memoryStorage();
  const storage = createSecureAuthStorage(secure, legacy);
  const session = JSON.stringify({
    access_token: "token-🔐-é-漢字-".repeat(1400),
    refresh_token: "refresh-token",
  });

  await storage.setItem("sb-project-auth-token", session);

  assert.equal(await storage.getItem("sb-project-auth-token"), session);
  assert.equal(await legacy.getItem("sb-project-auth-token"), null);
  assert.ok([...secure.values.entries()].some(([key]) => key.includes(".secure-v1.")));
  for (const [key, value] of secure.values) {
    if (!key.includes(".manifest")) {
      assert.ok(Buffer.byteLength(value, "utf8") <= 1700);
    }
  }
});

test("legacy SQLite localStorage session migrates only after secure persistence", async () => {
  const secure = memoryStorage();
  const legacy = memoryStorage();
  const storage = createSecureAuthStorage(secure, legacy);
  await legacy.setItem("sb-project-auth-token", JSON.stringify({ refresh_token: "legacy" }));

  assert.equal(
    await storage.getItem("sb-project-auth-token"),
    JSON.stringify({ refresh_token: "legacy" })
  );
  assert.equal(await legacy.getItem("sb-project-auth-token"), null);
  assert.ok(await secure.getItem("sb-project-auth-token.secure-v1.manifest"));
});

test("migration keeps the old session when secure persistence fails", async () => {
  const secure = memoryStorage({
    beforeSet() {
      throw new Error("simulated keychain unavailable");
    },
  });
  const legacy = memoryStorage();
  const storage = createSecureAuthStorage(secure, legacy);
  const oldSession = JSON.stringify({ refresh_token: "still-available" });
  await legacy.setItem("sb-project-auth-token", oldSession);

  await assert.rejects(storage.getItem("sb-project-auth-token"), /simulated keychain unavailable/);
  assert.equal(await legacy.getItem("sb-project-auth-token"), oldSession);
});

test("failed replacement leaves the previously committed session readable", async () => {
  let shouldFail = false;
  const secure = memoryStorage({
    beforeSet(key) {
      if (shouldFail && key.endsWith(".1")) throw new Error("simulated keychain write failure");
    },
  });
  const legacy = memoryStorage();
  const storage = createSecureAuthStorage(secure, legacy);
  const original = JSON.stringify({ refresh_token: "old" });
  await storage.setItem("sb-project-auth-token", original);
  shouldFail = true;

  await assert.rejects(
    storage.setItem("sb-project-auth-token", JSON.stringify({ refresh_token: "new".repeat(1000) })),
    /simulated keychain write failure/
  );
  assert.equal(await storage.getItem("sb-project-auth-token"), original);
});

test("removeItem deletes secure chunks and any legacy session", async () => {
  const secure = memoryStorage();
  const legacy = memoryStorage();
  const storage = createSecureAuthStorage(secure, legacy);
  await storage.setItem("sb-project-auth-token", JSON.stringify({ refresh_token: "secure" }));
  await legacy.setItem("sb-project-auth-token", JSON.stringify({ refresh_token: "legacy" }));

  await storage.removeItem("sb-project-auth-token");

  assert.equal(await secure.getItem("sb-project-auth-token.secure-v1.manifest"), null);
  assert.equal(await legacy.getItem("sb-project-auth-token"), null);
  assert.equal(await storage.getItem("sb-project-auth-token"), null);
});
