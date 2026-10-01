import assert from "node:assert/strict";
import test from "node:test";
import { removeOwnedStorageObjects } from "../api/lib/storage-cleanup.js";

const owner = "11111111-1111-4111-8111-111111111111";

function mockClient(directories, options = {}) {
  const removed = [];
  const listCalls = [];
  const client = {
    storage: {
      from(bucket) {
        return {
          async list(path, { limit, offset }) {
            listCalls.push({ bucket, path, limit, offset });
            if (options.listError) return { data: null, error: options.listError };
            const rows = directories[path] ?? [];
            return { data: rows.slice(offset, offset + limit), error: null };
          },
          async remove(paths) {
            if (options.removeError) return { data: null, error: options.removeError };
            removed.push(...paths.map((path) => ({ bucket, path })));
            return { data: paths.map((name) => ({ name })), error: null };
          }
        };
      }
    }
  };
  return { client, removed, listCalls };
}

test("removes nested private files under the authenticated owner's prefix", async () => {
  const { client, removed } = mockClient({
    [owner]: [
      { name: "project-a", id: null, metadata: null },
      { name: "artifact-b", id: null, metadata: null }
    ],
    [owner + "/project-a"]: [
      { name: "notes.md", id: "object-1", metadata: { size: 12 } }
    ],
    [owner + "/artifact-b"]: [
      { name: "image.png", id: "object-2", metadata: { size: 32 } }
    ]
  });

  const count = await removeOwnedStorageObjects(client, "artifact-files", owner);

  assert.equal(count, 2);
  assert.deepEqual(
    removed,
    [
      { bucket: "artifact-files", path: owner + "/project-a/notes.md" },
      { bucket: "artifact-files", path: owner + "/artifact-b/image.png" }
    ]
  );
});

test("lists every page and removes files in bounded batches", async () => {
  const files = Array.from({ length: 205 }, (_, index) => ({
    name: "file-" + index,
    id: "object-" + index,
    metadata: { size: 1 }
  }));
  const { client, removed, listCalls } = mockClient({ [owner]: files });

  const count = await removeOwnedStorageObjects(client, "project-files", owner);

  assert.equal(count, 205);
  assert.deepEqual(listCalls.map((call) => call.offset), [0, 100, 200]);
  assert.equal(removed.length, 205);
  assert.deepEqual(
    removed.map(({ path }) => path),
    files.map(({ name }) => owner + "/" + name)
  );
});

test("fails closed when listing fails and does not attempt deletion", async () => {
  const { client, removed } = mockClient({}, { listError: new Error("list denied") });

  await assert.rejects(
    removeOwnedStorageObjects(client, "project-files", owner),
    /list denied/
  );
  assert.deepEqual(removed, []);
});

test("fails closed when Storage removal fails", async () => {
  const { client, removed } = mockClient(
    {
      [owner]: [{ name: "private-file", id: "object-1", metadata: { size: 1 } }]
    },
    { removeError: new Error("remove denied") }
  );

  await assert.rejects(
    removeOwnedStorageObjects(client, "project-files", owner),
    /remove denied/
  );
  assert.deepEqual(removed, []);
});

test("rejects path separators returned by Storage listing", async () => {
  const { client, removed } = mockClient({
    [owner]: [{ name: "../other-user/private.png", id: "object-1", metadata: { size: 1 } }]
  });

  await assert.rejects(
    removeOwnedStorageObjects(client, "artifact-files", owner),
    /invalid path/
  );
  assert.deepEqual(removed, []);
});

test("rejects unknown buckets and invalid owner ids", async () => {
  const { client, removed } = mockClient({});

  await assert.rejects(
    removeOwnedStorageObjects(client, "public-assets", owner),
    /Unsupported private Storage bucket/
  );
  await assert.rejects(
    removeOwnedStorageObjects(client, "project-files", "../other-user"),
    /valid owner id/
  );
  assert.deepEqual(removed, []);
});
