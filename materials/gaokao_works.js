import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const worksDir = path.join(__dirname, "works");

function parseWorkOrder(fileName) {
  const match = fileName.match(/^(\d+)([a-z]*)\./i);
  if (!match) {
    return {
      number: Number.POSITIVE_INFINITY,
      suffix: "",
      fileName
    };
  }

  return {
    number: Number(match[1]),
    suffix: match[2].toLowerCase(),
    fileName
  };
}

function compareWorkFiles(left, right) {
  const a = parseWorkOrder(left);
  const b = parseWorkOrder(right);

  if (a.number !== b.number) return a.number - b.number;
  if (a.suffix !== b.suffix) return a.suffix.localeCompare(b.suffix, "en");
  return a.fileName.localeCompare(b.fileName, "zh-Hans-CN");
}

const workFiles = (await fs.readdir(worksDir))
  .filter((fileName) => fileName.endsWith(".js"))
  .sort(compareWorkFiles);

export const gaokaoWorks = await Promise.all(
  workFiles.map(async (fileName) => {
    const moduleUrl = pathToFileURL(path.join(worksDir, fileName)).href;
    const work = (await import(moduleUrl)).default;
    return {
      ...work,
      sourceFile: fileName
    };
  })
);
