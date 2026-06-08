import { describe, it, expect, afterEach } from "vitest";
import {
  makeCheckpoint,
  writeCheckpoint,
  readLatestCheckpoint,
  checkpointAge,
} from "../src/core/checkpoints";
import { tmpProject } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("checkpoint round-trip", () => {
  it("writes a checkpoint and reads back every field", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const cp = makeCheckpoint({
      summary: "Wired the odds feed",
      changed: ["Added poller", "Removed stub"],
      filesModified: ["src/feed.ts"],
      worked: ["Live odds render"],
      failed: ["WS reconnect drops"],
      blocker: "Reconnect storms under load",
      nextAction: "Add backoff",
      suggestedPrompt: "Resume the feed work and add backoff.",
    });
    await writeCheckpoint(p, cp);

    const back = await readLatestCheckpoint(p);
    expect(back).not.toBeNull();
    expect(back!.summary).toBe("Wired the odds feed");
    expect(back!.changed).toEqual(["Added poller", "Removed stub"]);
    expect(back!.filesModified).toEqual(["src/feed.ts"]);
    expect(back!.worked).toEqual(["Live odds render"]);
    expect(back!.failed).toEqual(["WS reconnect drops"]);
    expect(back!.blocker).toBe("Reconnect storms under load");
    expect(back!.nextAction).toBe("Add backoff");
    expect(back!.suggestedPrompt).toBe("Resume the feed work and add backoff.");
  });

  it("treats absent blocker/next as undefined, not the '_none_' placeholder", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const cp = makeCheckpoint({
      summary: "Minimal checkpoint",
      changed: [],
      filesModified: [],
      worked: [],
      failed: [],
    });
    await writeCheckpoint(p, cp);

    const back = await readLatestCheckpoint(p);
    // Regression guard: the renderer writes "_none_"; the parser must not leak it.
    expect(back!.blocker).toBeUndefined();
    expect(back!.nextAction).toBeUndefined();
    expect(back!.changed).toEqual([]);
    expect(back!.failed).toEqual([]);
  });

  it("returns the most recent checkpoint when several exist", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeCheckpoint(p, makeCheckpoint({ summary: "first", changed: [], filesModified: [], worked: [], failed: [] }));
    await writeCheckpoint(p, makeCheckpoint({ summary: "second", changed: [], filesModified: [], worked: [], failed: [] }));
    const back = await readLatestCheckpoint(p);
    expect(back!.summary).toBe("second");
  });

  it("returns null when no checkpoint exists", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    expect(await readLatestCheckpoint(p)).toBeNull();
  });
});

describe("checkpointAge", () => {
  it("labels a missing checkpoint as 'never'", () => {
    expect(checkpointAge(null)).toBe("never");
  });
});
