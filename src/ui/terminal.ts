import { spawn } from "child_process";
import readline from "readline";
import { DashboardAction, gatherDashboard, renderDashboardScreen, selectedActionIndex } from "./dashboard";
import { logger } from "../utils/logger";

interface TerminalLike {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  env: NodeJS.ProcessEnv;
  argv: string[];
  execPath: string;
}

export function shouldLaunchTerminalUi(
  args = process.argv.slice(2),
  io: Pick<TerminalLike, "stdin" | "stdout" | "env"> = process
): boolean {
  return (
    args.length === 0 &&
    Boolean(io.stdin.isTTY) &&
    Boolean(io.stdout.isTTY) &&
    io.env.CI !== "true" &&
    io.env.CONTINUITY_NO_TUI !== "1"
  );
}

export async function runTerminalUi(io: TerminalLike = process): Promise<void> {
  if (!io.stdin.isTTY || !io.stdout.isTTY) {
    logger.line("Interactive UI requires a TTY. Run `continuity status` for plain output.");
    return;
  }

  const app = new TerminalApp(io);
  await app.run();
}

class TerminalApp {
  private selected = 0;
  private running = true;
  private rawWasEnabled = false;

  constructor(private readonly io: TerminalLike) {}

  async run(): Promise<void> {
    this.enterScreen();
    try {
      while (this.running) {
        await this.render();
        const key = await this.readKey();
        await this.handleKey(key);
      }
    } finally {
      this.leaveScreen();
      this.io.stdin.pause();
    }
  }

  private async render(): Promise<void> {
    const model = await gatherDashboard();
    if (this.selected >= model.actions.length) this.selected = 0;
    this.io.stdout.write(
      renderDashboardScreen(model, this.selected, {
        columns: this.io.stdout.columns ?? 80,
        rows: this.io.stdout.rows ?? 24,
      })
    );
  }

  private async handleKey(key: string): Promise<void> {
    if (key === "\u0003" || key.toLowerCase() === "q") {
      this.running = false;
      return;
    }

    const model = await gatherDashboard();
    if (key === "\t" || key === "\x1b[C" || key === "\x1b[B") {
      this.selected = selectedActionIndex(model.actions, this.selected, 1);
      return;
    }
    if (key === "\x1b[D" || key === "\x1b[A") {
      this.selected = selectedActionIndex(model.actions, this.selected, -1);
      return;
    }

    const hotkey = model.actions.findIndex((a) => a.key === key.toLowerCase());
    if (hotkey >= 0) {
      this.selected = hotkey;
      await this.runAction(model.actions[hotkey]);
      return;
    }

    if (key === "\r" || key === "\n") {
      const action = model.actions[this.selected];
      if (action) await this.runAction(action);
    }
  }

  private async runAction(action: DashboardAction): Promise<void> {
    this.leaveScreen();
    try {
      const args = [...action.command];
      if (action.prompt) {
        const answer = await askLine(`${action.prompt}: `, this.io);
        if (!answer) return;
        args.push(answer);
      }
      await spawnCli(args, this.io);
      await pressAnyKey(this.io);
    } finally {
      this.enterScreen();
    }
  }

  private readKey(): Promise<string> {
    return new Promise((resolve) => {
      this.io.stdin.once("data", (chunk) => resolve(chunk.toString("utf8")));
    });
  }

  private enterScreen(): void {
    this.io.stdout.write("\x1b[?1049h\x1b[?25l");
    if (typeof this.io.stdin.setRawMode === "function") {
      this.rawWasEnabled = Boolean(this.io.stdin.isRaw);
      this.io.stdin.setRawMode(true);
    }
    this.io.stdin.resume();
  }

  private leaveScreen(): void {
    if (typeof this.io.stdin.setRawMode === "function") {
      this.io.stdin.setRawMode(this.rawWasEnabled);
    }
    this.io.stdout.write("\x1b[?25h\x1b[?1049l");
  }
}

async function spawnCli(args: string[], io: TerminalLike): Promise<void> {
  const entry = io.argv[1];
  if (!entry) {
    logger.warn("Cannot find the Continuity CLI entry point for this session.");
    return;
  }

  await new Promise<void>((resolve) => {
    const child = spawn(io.execPath, [entry, ...args], {
      stdio: "inherit",
      env: { ...io.env, CONTINUITY_NO_TUI: "1" },
    });
    child.on("error", (err) => {
      logger.error(`Could not run continuity ${args.join(" ")}.`);
      logger.dim(err.message);
      resolve();
    });
    child.on("close", () => resolve());
  });
}

function askLine(prompt: string, io: TerminalLike): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: io.stdin, output: io.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function pressAnyKey(io: TerminalLike): Promise<void> {
  io.stdout.write("\nPress any key to return to Continuity...");
  const wasRaw = Boolean(io.stdin.isRaw);
  if (typeof io.stdin.setRawMode === "function") io.stdin.setRawMode(true);
  await new Promise<void>((resolve) => {
    io.stdin.once("data", () => resolve());
  });
  if (typeof io.stdin.setRawMode === "function") io.stdin.setRawMode(wasRaw);
}
