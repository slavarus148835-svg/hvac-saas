import path from "node:path";
import dotenv from "dotenv";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
dotenv.config({ path: path.join(root, ".env"), override: true });
export const ROOT = root;
