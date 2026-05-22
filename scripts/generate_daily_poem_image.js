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
生成一张极简留白的古风水墨诗词海报，分辨率 800x480。

篇目：
- 标题：《${selectedPoem.title}》
- 作者：${selectedPoem.author}
${excerptRangeInstruction}

要求：
- 正文必须严格使用给定文本，不要改字、漏字、增字。
- 只展示标题、作者、正文；不要译文、注释、赏析、拼音、英文、水印、logo、二维码或日期。
- 正文中的非空行是自然语义行，空白行是段落分隔；排版时保留这种节奏。
- 画面整体接近白底，留白充足，干净克制，可以有非常轻微的宣纸纹理。
- 水墨意象要淡、少、轻，可根据诗意加入月、远山、梅枝、竹影、人物等少量元素，但不要铺满画面。
- 标题可以使用有设计感的书法或国风字体；正文使用常见、清晰、端正的中文印刷字体，优先宋体、楷体或仿宋气质，避免黑体，避免正文过度花哨。
- 诗文正文字号适中偏大，保证 800x480 屏幕阅读清晰即可，不要小字密排。
- 段落之间可以使用短横线、极淡细线或留白作为分隔。
- 可以加入一枚小红印章作为点缀，红色只用于印章或极少量 accent。
- 字体、构图和意象可以由模型自由发挥，要有诗词海报的审美，不要像普通文档截图。
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
