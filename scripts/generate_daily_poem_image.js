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

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).formatToParts(new Date());
const dateValue = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
const todayKey = `${dateValue.year}-${dateValue.month}-${dateValue.day}`;
const rotationStartKey = process.env.POEM_ROTATION_START_DATE ?? "2026-05-20";
const dayIndex =
  Math.floor(
    (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${rotationStartKey}T00:00:00Z`)) / 86400000
  );
const poemIndex = ((dayIndex % gaokaoPoems.length) + gaokaoPoems.length) % gaokaoPoems.length;
const selectedPoem = gaokaoPoems[poemIndex];

const safeTitle = selectedPoem.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
const poemOutputFile = path.join(repoRoot, `${safeTitle}.png`);
const fullTextInstruction =
  Array.isArray(selectedPoem.fullText) && selectedPoem.fullText.length > 0
    ? `- 正文全文：\n${selectedPoem.fullText.map((line) => `  ${line}`).join("\n")}`
    : null;
const excerptRangeInstruction =
  fullTextInstruction ??
  (selectedPoem.excerptStart && selectedPoem.excerptEnd
    ? `- 节选范围：从「${selectedPoem.excerptStart}」到「${selectedPoem.excerptEnd}」。`
    : "- 正文范围：使用该篇目的高考常见背诵范围。");

const prompt = `
生成一张完整的中国古诗文海报。

指定篇目：
- 诗名：《${selectedPoem.title}》
- 作者：${selectedPoem.author}
${excerptRangeInstruction}

硬性要求：
- 画面比例为 5:3，适合最终缩放为 800x480 横向电子相框图片。
- 海报中必须包含篇名、作者、篇目正文。
- 正文必须对应指定篇目和上方给定的正文全文或节选范围，不要选择其他作品或超出节选范围。
- 如果正文全文中有空白行，空白行表示按古文韵律和语义划分的自然段落；排版时必须按这些段落分组，段落之间留出明显空隙。
- 不要包含译文、注释、赏析、英文、拼音、二维码、水印、logo 或日期。
- 中文文字必须清晰、端正、可读，避免错字、漏字和乱码。
- 字体要明显偏大，适合 800x480 小尺寸屏幕远距离阅读，不要使用过小正文。
- 正文必须使用常规横排中文排版，阅读顺序从左到右、从上到下，不要竖排、倒排或书法式散排。
- 排版必须稳定、留白充足。
- 背景与篇目意境一致，典雅、克制、有中国古典审美。
- 整体画面需要是明亮、清爽、留白充足的浅色氛围，可以用红色、蓝色、黄色作为少量点缀，色彩不要杂乱。
- 最终图像必须是一张已经完成渲染的海报，不要输出分镜、草图或说明文字。
`;

if (process.argv.includes("--dry-run") || process.env.DRY_RUN === "1") {
  console.log(`Selected: ${selectedPoem.title} / ${selectedPoem.author}`);
  console.log(`Daily output: ${dailyOutputFile}`);
  console.log(`Poem output: ${poemOutputFile}`);
  console.log(prompt.trim());
  process.exit(0);
}

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required.");
}

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
  throw new Error(`OpenAI image generation failed: ${response.status} ${body}`);
}

const result = await response.json();
const imageBase64 = result?.data?.[0]?.b64_json;
if (!imageBase64) {
  throw new Error("OpenAI image generation response did not include data[0].b64_json.");
}

const imageBuffer = Buffer.from(imageBase64, "base64");
const { default: sharp } = await import("sharp");
const posterBuffer = await sharp(imageBuffer)
  .resize(800, 480, {
    fit: "cover",
    position: "center"
  })
  .png()
  .toBuffer();

await fs.writeFile(dailyOutputFile, posterBuffer);
await fs.writeFile(poemOutputFile, posterBuffer);

console.log(`Generated ${dailyOutputFile}`);
console.log(`Generated ${poemOutputFile}`);

