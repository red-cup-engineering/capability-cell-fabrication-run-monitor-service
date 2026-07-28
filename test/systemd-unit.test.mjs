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

test("deployed HTTP faces execute the providers already installed by the hiring Actor", async () => {
  const [x402, activitypub] = await Promise.all([
    readFile(new URL(
      "../ops/systemd/bare-cedar-fog-capability-cell-fabrication-run-monitor-x402.service",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../ops/systemd/bare-cedar-fog-capability-cell-fabrication-run-monitor-activitypub.service",
      import.meta.url,
    ), "utf8"),
  ]);
  const installedRoot = "/board-of-directors/services/executive-office/services/union-platform-node-fabrication-services-section/node_modules/@red-cup-engineering/";
  assert.match(x402, new RegExp(`${installedRoot}capability-cell-fabrication-run-monitor-service/bin/x402-server\\.mjs`));
  assert.match(x402, /X402_FACILITATOR_URL=http:\/\/127\.0\.0\.1:18893\/x402\/facilitator/u);
  assert.doesNotMatch(x402, /X402_FACILITATOR_URL=http:\/\/127\.0\.0\.1:18893\s/u);
  assert.match(activitypub, new RegExp(`${installedRoot}activitypub-services-section/src/server\\.mjs`));
  assert.doesNotMatch(x402, /ExecStart=.*\sbin\/x402-server\.mjs$/mu);
  assert.doesNotMatch(activitypub, /@emsenn\/activitypub-services-section/u);
});
