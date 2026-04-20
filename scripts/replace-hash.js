import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const hashFile = resolve(projectRoot, ".git-hash");
const hash = existsSync(hashFile) ? readFileSync(hashFile, "utf-8").trim() : "local";

const distFile = resolve(projectRoot, "dist/src/extension.js");
let content = readFileSync(distFile, "utf-8");
content = content.split("@@GIT_HASH@@").join(hash);
writeFileSync(distFile, content);

console.log("Hash: " + hash);