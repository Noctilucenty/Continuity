import { describe, it, expect } from "vitest";
import pc from "picocolors";
import {
  stripAnsi,
  clipboardCommand,
  copyToClipboard,
  SpawnWriter,
} from "../src/utils/clipboard";

describe("stripAnsi", () => {
  it("removes SGR color escape sequences", () => {
    const esc = String.fromCharCode(27);
    const colored = `${esc}[31mhello${esc}[0m`;
    expect(stripAnsi(colored)).toBe("hello");
  });
  it("strips picocolors output", () => {
    const colored = pc.red(pc.bold("danger"));
    const clean = stripAnsi(colored);
    expect(clean).toBe("danger");
    expect(clean).not.toContain(String.fromCharCode(27));
  });
  it("leaves plain text untouched", () => {
    expect(stripAnsi("plain markdown")).toBe("plain markdown");
  });
});

describe("clipboardCommand", () => {
  it("selects the right tool per platform", () => {
    expect(clipboardCommand("darwin")).toEqual({ cmd: "pbcopy", args: [] });
    expect(clipboardCommand("win32")).toEqual({ cmd: "clip", args: [] });
    expect(clipboardCommand("linux")?.cmd).toBe("xclip");
    expect(clipboardCommand("freebsd" as NodeJS.Platform)).toBeNull();
  });
});

describe("copyToClipboard", () => {
  it("returns true and passes ANSI-free content to the writer", async () => {
    let captured = "";
    const writer: SpawnWriter = async (_cmd, _args, input) => {
      captured = input;
      return true;
    };
    const colored = pc.green("copy me");
    const ok = await copyToClipboard(colored, { platform: "darwin", writer });
    expect(ok).toBe(true);
    expect(captured).toBe("copy me");
    expect(captured).not.toContain(String.fromCharCode(27));
  });

  it("returns false gracefully when the writer fails", async () => {
    const writer: SpawnWriter = async () => false;
    expect(await copyToClipboard("x", { platform: "darwin", writer })).toBe(false);
  });

  it("does not throw if the writer throws", async () => {
    const writer: SpawnWriter = async () => {
      throw new Error("spawn boom");
    };
    await expect(copyToClipboard("x", { platform: "darwin", writer })).resolves.toBe(false);
  });

  it("returns false on an unsupported platform", async () => {
    const writer: SpawnWriter = async () => true;
    expect(await copyToClipboard("x", { platform: "freebsd" as NodeJS.Platform, writer })).toBe(false);
  });

  it("tries Linux fallbacks until one succeeds", async () => {
    const tried: string[] = [];
    const writer: SpawnWriter = async (cmd) => {
      tried.push(cmd);
      return cmd === "xsel"; // xclip fails, xsel works
    };
    const ok = await copyToClipboard("x", { platform: "linux", writer });
    expect(ok).toBe(true);
    expect(tried).toEqual(["xclip", "xsel"]);
  });
});
