import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { writeTextAtomic } from "../src/utils";

const targetPath = process.argv[2];

if (!targetPath) {
  throw new Error("Usage: bun run scripts/write-checksum.ts <artifact-path>");
}

const bytes = readFileSync(targetPath);
const checksum = createHash("sha256").update(bytes).digest("hex");
const outputPath = `${targetPath}.sha256`;
const fileName = path.basename(targetPath);

writeTextAtomic(outputPath, `${checksum}  ${fileName}\n`);
process.stdout.write(`${outputPath}\n`);
