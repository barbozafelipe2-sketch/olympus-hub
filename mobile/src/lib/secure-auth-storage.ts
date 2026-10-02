export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface SecureStorageManifest {
  version: 1;
  generation: string;
  chunks: number;
}

const CHUNK_SIZE_BYTES = 1700;
const MAX_CHUNKS = 256;

function utf8Length(value: string) {
  const point = value.codePointAt(0) ?? 0;
  if (point <= 0x7f) return 1;
  if (point <= 0x7ff) return 2;
  if (point <= 0xffff) return 3;
  return 4;
}

function splitIntoChunks(value: string) {
  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const character of value) {
    const bytes = utf8Length(character);
    if (chunkBytes + bytes > CHUNK_SIZE_BYTES) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += bytes;
  }

  if (chunk || chunks.length === 0) chunks.push(chunk);
  if (chunks.length > MAX_CHUNKS) {
    throw new Error("The Supabase session is too large for secure device storage.");
  }
  return chunks;
}

function isManifest(value: unknown): value is SecureStorageManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<SecureStorageManifest>;
  return (
    manifest.version === 1 &&
    typeof manifest.generation === "string" &&
    /^[a-z0-9]+$/.test(manifest.generation) &&
    Number.isInteger(manifest.chunks) &&
    (manifest.chunks ?? 0) > 0 &&
    (manifest.chunks ?? MAX_CHUNKS + 1) <= MAX_CHUNKS
  );
}

function generationId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function createSecureAuthStorage(
  secureStorage: KeyValueStorage,
  legacyStorage: KeyValueStorage
): KeyValueStorage {
  const locks = new Map<string, Promise<void>>();

  async function withKeyLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(key, next);
    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (locks.get(key) === next) locks.delete(key);
    }
  }

  function manifestKey(key: string) {
    return `${key}.secure-v1.manifest`;
  }

  function chunkKey(key: string, generation: string, index: number) {
    return `${key}.secure-v1.${generation}.${index}`;
  }

  async function readSecureValue(key: string) {
    const rawManifest = await secureStorage.getItem(manifestKey(key));
    if (!rawManifest) return null;

    let manifest: unknown;
    try {
      manifest = JSON.parse(rawManifest);
    } catch {
      await secureStorage.removeItem(manifestKey(key));
      return null;
    }

    if (!isManifest(manifest)) {
      await secureStorage.removeItem(manifestKey(key));
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: manifest.chunks }, (_, index) =>
        secureStorage.getItem(chunkKey(key, manifest.generation, index))
      )
    );
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join("");
  }

  async function writeSecureValue(key: string, value: string) {
    const previous = await secureStorage.getItem(manifestKey(key));
    let oldManifest: unknown;
    try {
      oldManifest = previous ? JSON.parse(previous) : null;
    } catch {
      oldManifest = null;
    }

    const chunks = splitIntoChunks(value);
    const generation = generationId();
    let committed = false;

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        await secureStorage.setItem(chunkKey(key, generation, index), chunks[index]);
      }
      await secureStorage.setItem(
        manifestKey(key),
        JSON.stringify({ version: 1, generation, chunks: chunks.length })
      );
      committed = true;
    } finally {
      if (!committed) {
        await Promise.all(
          chunks.map((_, index) =>
            secureStorage.removeItem(chunkKey(key, generation, index)).catch(() => undefined)
          )
        );
      }
    }

    if (isManifest(oldManifest)) {
      await Promise.all(
        Array.from({ length: oldManifest.chunks }, (_, index) =>
          secureStorage
            .removeItem(chunkKey(key, oldManifest.generation, index))
            .catch(() => undefined)
        )
      );
    }
  }

  return {
    getItem(key) {
      return withKeyLock(key, async () => {
        const secureValue = await readSecureValue(key);
        if (secureValue !== null) return secureValue;

        const legacyValue = await legacyStorage.getItem(key);
        if (legacyValue === null) return null;

        await writeSecureValue(key, legacyValue);
        await legacyStorage.removeItem(key).catch(() => undefined);
        return legacyValue;
      });
    },

    setItem(key, value) {
      return withKeyLock(key, async () => {
        await writeSecureValue(key, value);
        await legacyStorage.removeItem(key).catch(() => undefined);
      });
    },

    removeItem(key) {
      return withKeyLock(key, async () => {
        const keyForManifest = manifestKey(key);
        const rawManifest = await secureStorage.getItem(keyForManifest);
        await secureStorage.removeItem(keyForManifest);

        if (rawManifest) {
          let manifest: unknown;
          try {
            manifest = JSON.parse(rawManifest);
          } catch {
            manifest = null;
          }
          if (isManifest(manifest)) {
            await Promise.all(
              Array.from({ length: manifest.chunks }, (_, index) =>
                secureStorage.removeItem(chunkKey(key, manifest.generation, index))
              )
            );
          }
        }

        await legacyStorage.removeItem(key);
      });
    },
  };
}
