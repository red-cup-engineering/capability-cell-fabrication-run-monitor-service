import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the installed A2A face does not impose retired task-size limits", async () => {
  const unit = await readFile(new URL(
    "../ops/systemd/bare-cedar-fog-capability-cell-fabrication-run-monitor-a2a.service",
    import.meta.url,
  ), "utf8");
  assert.doesNotMatch(unit, /--(?:request-)?max-bytes\b/u);
});
