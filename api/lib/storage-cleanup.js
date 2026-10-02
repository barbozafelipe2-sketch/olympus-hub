const PRIVATE_BUCKETS = new Set(["project-files", "artifact-files"]);
const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;
const MAX_FOLDER_DEPTH = 8;

export async function removeOwnedStorageObjects(client, bucket, ownerId) {
  if (!PRIVATE_BUCKETS.has(bucket)) {
    throw new Error("Unsupported private Storage bucket.");
  }
  if (
    typeof ownerId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)
  ) {
    throw new Error("A valid owner id is required for Storage cleanup.");
  }

  const storage = client.storage.from(bucket);
  const paths = [];

  async function walk(prefix, depth) {
    if (depth > MAX_FOLDER_DEPTH) {
      throw new Error("Private Storage folder depth exceeds the cleanup limit.");
    }

    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await storage.list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset
      });
      if (error) throw error;
      if (!Array.isArray(data)) {
        throw new Error("Private Storage listing returned an invalid response.");
      }

      for (const item of data) {
        if (
          typeof item?.name !== "string" ||
          item.name.length === 0 ||
          item.name === "." ||
          item.name === ".." ||
          item.name.includes("/")
        ) {
          throw new Error("Private Storage listing returned an invalid path.");
        }

        const path = prefix + "/" + item.name;
        if (item.id == null && item.metadata == null) {
          await walk(path, depth + 1);
        } else {
          paths.push(path);
        }
      }

      if (data.length < LIST_PAGE_SIZE) break;
    }
  }

  await walk(ownerId, 0);

  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + REMOVE_BATCH_SIZE);
    const { error } = await storage.remove(batch);
    if (error) throw error;
  }

  return paths.length;
}
