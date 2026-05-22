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
const shouldWriteDailyOutput = requestedWorks.length === 0;

function getPoemOutputFile(selectedPoem) {
  const safeTitle = selectedPoem.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
  return path.join(repoRoot, `${safeTitle}.png`);
}

function createPrompt(selectedPoem) {
  const fullTextInstruction =
    Array.isArray(selectedPoem.fullText) && selectedPoem.fullText.length > 0
      ? `- 正文全文，按此顺序排版；非空行是自然语义行，空白行是段落分隔：\n${selectedPoem.fullText
          .map((line) => (line.trim() ? `  ${line}` : ""))
          .join("\n")}`
      : null;
  const excerptRangeInstruction =
    fullTextInstruction ??
    (selectedPoem.excerptStart && selectedPoem.excerptEnd
      ? `- 节选范围：从「${selectedPoem.excerptStart}」到「${selectedPoem.excerptEnd}」。`
      : "- 正文范围：使用该篇目的高考常见背诵范围。");

  return `
生成一张古风水墨诗词海报，横版 5:3，最终会缩放为 800x480。

篇目：
- 标题：《${selectedPoem.title}》
- 作者：${selectedPoem.author}
${excerptRangeInstruction}

要求：
- 只展示标题、作者、正文，不要译文、注释、赏析、英文、拼音、二维码、水印、logo 或日期。
- 正文必须严格使用给定文本，不要改字、漏字、增字，不要补全整篇原文。
- 正文中的非空行是自然语义行，空白行是段落分隔；排版时保留这种节奏。
- 正文横排，从左到右、从上到下阅读，清晰可读。
- 诗文正文字号要明显偏大，优先保证 800x480 屏幕远距离阅读；不要使用小字密排。
- 整体古风、水墨、极简、留白充足，画面干净克制。
- 背景以接近纯白的干净白底为主，不要偏黄、偏灰或厚重仿古纸色；只允许非常轻微的宣纸纹理。
- 水墨和意象元素要淡、少、轻，不能让背景变暗或铺满画面。
- 可根据诗文意境自由安排标题、作者、正文和少量意象元素。
- 字体和构图由模型自行发挥，但要有诗词海报的审美，不要像普通文档截图。
- 最终图像必须是一张完整渲染图，不要输出分镜、草图或说明文字。
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
