import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { logLine } from "../log.js";

export type CodeTaskPayload = {
  prompt: string;
  repoPath?: string;
};

export type CodeTaskResult = {
  summary: string;
  changedFiles: string[];
  logs: string;
};

const root = path.resolve(import.meta.dirname, "..", "..", "..", "..");

async function callOpenAI(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  if (!key) {
    return "[OPENAI_API_KEY missing] echo: " + prompt.slice(0, 500);
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a coding agent assistant. Answer concisely." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI empty response");
  return text;
}

function runShell(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const child = spawn(isWin ? "cmd.exe" : "sh", isWin ? ["/d", "/s", "/c", cmd] : ["-c", cmd], {
      cwd,
      shell: false,
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(`exit=${code}\n--- stdout ---\n${out}\n--- stderr ---\n${err}`);
    });
  });
}

export async function executeCodeTask(taskId: string, payload: CodeTaskPayload): Promise<CodeTaskResult> {
  const runDir = path.join(root, "task-runs", taskId);
  fs.mkdirSync(runDir, { recursive: true });
  const promptPath = path.join(runDir, "prompt.txt");
  fs.writeFileSync(promptPath, payload.prompt, "utf8");
  logLine(`code_task runDir=${runDir}`);

  const cwd = payload.repoPath ? path.resolve(root, payload.repoPath) : root;
  const logs: string[] = [];
  logs.push(`runDir: ${runDir}`);
  logs.push(`cwd: ${cwd}`);

  let shellOut = "";
  try {
    const probe = process.platform === "win32" ? "cd & echo probe-ok" : "pwd && echo probe-ok";
    shellOut = await runShell(probe, fs.existsSync(cwd) ? cwd : root);
    logs.push("shell:\n" + shellOut);
  } catch (e) {
    logs.push("shell error: " + (e instanceof Error ? e.message : String(e)));
  }

  let ai = "";
  try {
    ai = await callOpenAI(payload.prompt);
    fs.writeFileSync(path.join(runDir, "openai-response.txt"), ai, "utf8");
    logs.push("openai: ok, length=" + ai.length);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push("openai error: " + msg);
    fs.writeFileSync(path.join(runDir, "openai-error.txt"), msg, "utf8");
    ai = "OpenAI failed: " + msg;
  }

  return {
    summary: ai.slice(0, 4000),
    changedFiles: [],
    logs: logs.join("\n\n"),
  };
}
