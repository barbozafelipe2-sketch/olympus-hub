import assert from "node:assert/strict";
import test from "node:test";
import { readRequestedProjectFiles } from "../api/lib/capabilities.js";

function message(content) {
  return [{ role: "user", content }];
}

function file(id, name, mime_type, size_bytes = 128) {
  return {
    id,
    name,
    mime_type,
    size_bytes,
    storage_path: "owner/project/" + id + "-" + name
  };
}

test("unsupported requested files are disclosed without attempting to read them", async () => {
  const result = await readRequestedProjectFiles({
    client: {
      storage: {
        from() {
          throw new Error("Unsupported files should not be downloaded.");
        }
      }
    },
    files: [file("pdf-1", "brief.pdf", "application/pdf")],
    messages: message("Analyze brief.pdf and tell me what it says.")
  });

  assert.match(result.context, /contents could not be read/i);
  assert.match(result.context, /brief\.pdf/);
  assert.equal(result.traces.length, 1);
  assert.equal(result.traces[0].status, "failed");
});

test("mixed file requests identify readable and skipped files separately", async () => {
  const result = await readRequestedProjectFiles({
    client: {
      storage: {
        from() {
          return {
            async download() {
              return { data: new Blob(["Quarterly revenue: 1200."]), error: null };
            }
          };
        }
      }
    },
    files: [
      file("text-1", "numbers.csv", "text/csv"),
      file("pdf-1", "chart.pdf", "application/pdf")
    ],
    messages: message("Analyze the project files and compare their contents.")
  });

  assert.match(result.context, /Quarterly revenue: 1200/);
  assert.match(result.context, /chart\.pdf/);
  assert.match(result.context, /do not imply they were read/i);
  assert.deepEqual(
    result.traces.map((trace) => trace.status).sort(),
    ["completed", "failed"]
  );
});

test("download failures produce an explicit unreadable-file instruction", async () => {
  const result = await readRequestedProjectFiles({
    client: {
      storage: {
        from() {
          return {
            async download() {
              return { data: null, error: new Error("Storage unavailable") };
            }
          };
        }
      }
    },
    files: [file("text-1", "notes.txt", "text/plain")],
    messages: message("Please read notes.txt")
  });

  assert.match(result.context, /content could not be loaded/i);
  assert.match(result.context, /do not infer/i);
  assert.equal(result.traces[0].status, "failed");
});
