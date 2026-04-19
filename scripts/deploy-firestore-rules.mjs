import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const projectId = execSync("node scripts/resolve-firebase-project.mjs", {
  cwd: root,
  encoding: "utf8",
}).trim();

const firebaserc = { projects: { default: projectId } };
fs.writeFileSync(path.join(root, ".firebaserc"), JSON.stringify(firebaserc, null, 2) + "\n", "utf8");

const cmd = `npx --yes firebase-tools@13 deploy --only firestore:rules --project ${projectId} --non-interactive`;

console.error("[deploy-firestore-rules] projectId=", projectId);
if (!process.env.FIREBASE_TOKEN?.trim()) {
  console.error("[deploy-firestore-rules] FIREBASE_TOKEN не задан — см. https://firebase.google.com/docs/cli#cli-ci-systems");
}
execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env });
