import assert from "node:assert/strict";
import test from "node:test";

import { deriveStatusText } from "../src/ui/statusText.ts";

test("deriveStatusText shows the raw error status even when a frame label is available", () => {
  const result = deriveStatusText({
    status: "Hangar run failed: boom",
    statusIsError: true,
    frameLabel: "Replay 3/10 - tick 42",
  });
  assert.equal(result, "Hangar run failed: boom");
});

test("deriveStatusText shows the frame label when status is not an error", () => {
  const result = deriveStatusText({
    status: "Hangar run loaded - 10 frames",
    statusIsError: false,
    frameLabel: "Replay 3/10 - tick 42",
  });
  assert.equal(result, "Replay 3/10 - tick 42");
});

test("deriveStatusText shows the raw status when there is no frame label", () => {
  const result = deriveStatusText({
    status: "Ready",
    statusIsError: false,
    frameLabel: null,
  });
  assert.equal(result, "Ready");
});
