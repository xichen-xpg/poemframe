import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gaokaoWorks } from "../materials/gaokao_works.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const apiKey = process.env.OPENAI_API_KEY;

const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const generationSize = process.env.OPENAI_IMAGE_SIZE ?? "1280x768";
const requestTimeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS ?? 5 * 60 * 1000);
const dailyOutputFile = path.join(repoRoot, "每日古诗词.png");

const gaokaoPoems = gaokaoWorks;

function getArgValue(name) {
  const prefix = `${name}=`;
  const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
  if (inlineArg) return inlineArg.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index !== -1) return process.argv[index + 1];

  return null;
}

function normalizeLookupValue(value) {
  return value.replace(/\s+/g, "").replace(/[《》]/g, "").toLowerCase();
}

function findPoemByName(name) {
  const normalizedName = normalizeLookupValue(name);
  const poem = gaokaoPoems.find((candidate) => {
    const title = normalizeLookupValue(candidate.title);
    const sourceFile = normalizeLookupValue(candidate.sourceFile ?? "");
    return title === normalizedName || sourceFile === normalizedName || sourceFile.endsWith(`${normalizedName}.js`);
  });

  if (!poem) {
    throw new Error(`Could not find poem: ${name}`);
  }

  return poem;
}

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).formatToParts(new Date());
const dateValue = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
const todayKey = `${dateValue.year}-${dateValue.month}-${dateValue.day}`;
const rotationStartKey = process.env.POEM_ROTATION_START_DATE ?? "2026-05-20";
const dayIndex = Math.floor(
  (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${rotationStartKey}T00:00:00Z`)) / 86400000
);
const poemIndex = ((dayIndex % gaokaoPoems.length) + gaokaoPoems.length) % gaokaoPoems.length;
const requestedWorks = (process.env.POEM_WORKS ?? getArgValue("--work") ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const selectedPoems = requestedWorks.length > 0 ? requestedWorks.map(findPoemByName) : [gaokaoPoems[poemIndex]];
const shouldWriteDailyOutput =
  requestedWorks.length === 0 || process.env.UPDATE_DAILY_OUTPUT === "1" || process.argv.includes("--update-daily");

function getPoemOutputFile(selectedPoem) {
  const sourceTitle = selectedPoem.sourceFile
    ?.replace(/\.js$/i, "")
    .replace(/^\d+[a-z]*\./i, "")
    .trim();
  const outputTitle = sourceTitle || selectedPoem.title;
  const safeTitle = outputTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
  return path.join(repoRoot, `${safeTitle}.png`);
}

function createPrompt(selectedPoem) {
  if (!Array.isArray(selectedPoem.fullText) || selectedPoem.fullText.length === 0) {
    throw new Error(`Poem ${selectedPoem.title} is missing fullText.`);
  }

  const fullTextInstruction = `- 正文：\n${selectedPoem.fullText
    .map((line) => (line.trim() ? `  ${line}` : ""))
    .join("\n")}`;

  return `
生成一张白底设计感古风水墨海报，分辨率800x480。

篇目：
- 标题：《${selectedPoem.title}》
- 作者：${selectedPoem.author}
${fullTextInstruction}

要求：
- 正文必须严格使用给定文本，不要改字、漏字、增字。
- 正文必须严格按上方给定文本和顺序排版；非空行是自然语义行，空白行是段落分隔，排版时保留这种节奏。
- 使用左侧竖排大标题 + 作者竖栏 + 小红印 + 中右部横排正文的诗笺式版式。
- 标题使用国风艺术设计感字体，其他部分使用仿宋字体，诗人名字旁点缀红色印章。
- 诗文正文字号适中偏大，保证 800x480 屏幕阅读清晰即可。
- 配图内容必须与正文内容相关，优先选择正文中出现或直接暗示的意象、场景、物象和情绪，不要使用与诗文无关的泛用山水装饰。
`;
}

if (process.argv.includes("--dry-run") || process.env.DRY_RUN === "1") {
  for (const selectedPoem of selectedPoems) {
    console.log(`Selected: ${selectedPoem.title} / ${selectedPoem.author}`);
    if (shouldWriteDailyOutput) console.log(`Daily output: ${dailyOutputFile}`);
    console.log(`Poem output: ${getPoemOutputFile(selectedPoem)}`);
    console.log(createPrompt(selectedPoem).trim());
    console.log("\n---\n");
  }
  process.exit(0);
}

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required.");
}

const { default: sharp } = await import("sharp");

for (const selectedPoem of selectedPoems) {
  const prompt = createPrompt(selectedPoem);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      prompt,
      size: generationSize,
      n: 1
    })
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI image generation failed for ${selectedPoem.title}: ${response.status} ${body}`);
  }

  const result = await response.json();
  const imageBase64 = result?.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error(`OpenAI image generation response for ${selectedPoem.title} did not include data[0].b64_json.`);
  }

  const imageBuffer = Buffer.from(imageBase64, "base64");
  const posterBuffer = await sharp(imageBuffer)
    .resize(800, 480, {
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();

  if (shouldWriteDailyOutput) {
    await fs.writeFile(dailyOutputFile, posterBuffer);
    console.log(`Generated ${dailyOutputFile}`);
  }

  const poemOutputFile = getPoemOutputFile(selectedPoem);
  await fs.writeFile(poemOutputFile, posterBuffer);
  console.log(`Generated ${poemOutputFile}`);
}
