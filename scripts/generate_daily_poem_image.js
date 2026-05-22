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
      ? `- 正文全文，按此顺序逐行排版；空白行表示自然段落间隔：\n${selectedPoem.fullText
          .map((line) => (line.trim() ? `  ${line}` : ""))
          .join("\n")}`
      : null;
  const excerptRangeInstruction =
    fullTextInstruction ??
    (selectedPoem.excerptStart && selectedPoem.excerptEnd
      ? `- 节选范围：从「${selectedPoem.excerptStart}」到「${selectedPoem.excerptEnd}」。`
      : "- 正文范围：使用该篇目的高考常见背诵范围。");

  return `
请直接生成一张完成度高的中国古诗文海报，横版 5:3，最终会缩放为 800x480。

指定篇目：
- 标题：《${selectedPoem.title}》
- 作者：${selectedPoem.author}
${excerptRangeInstruction}

内容规则：
- 只展示标题、作者、正文，不要译文、注释、赏析、英文、拼音、二维码、水印、logo 或日期。
- 正文必须严格来自上方给定文本，不要改字、漏字、增字，不要替换成同篇其他段落。
- 当前素材已经按每日海报拆分成单页篇目；不要再试图补全整篇原文，只排版当前给定文本。
- 正文列表中的每个非空行是一个自然语义行；空白行是段落分隔。排版时保留这种分组，段落之间留出明显呼吸感。

版式规则：
- 不要做成普通文档截图，要像精心设计的诗词海报。
- 标题可以使用更有表现力的大字书法、榜书、行楷或篆意字体，形成第一视觉焦点。
- 作者可以用较小字号，放在标题旁、竖向边栏、题签或印章附近；可加入一枚小红印作为点缀。
- 正文必须使用清晰可读的楷体、宋体或仿宋风格，字体要大，适合 800x480 屏幕远距离阅读。
- 标题、作者、正文可以使用不同字体层级，但正文内部保持统一，不要花哨到影响识别。
- 正文横排，从左到右、从上到下阅读；不要竖排正文，不要倒排，不要散乱书法字。
- 根据文本长短自适应布局：短诗可以留白更大、字更大；长文节选要分栏、分块或压缩装饰，但仍需清晰完整。

画面规则：
- 背景根据本篇正文意象重新设计，不要套用固定山水模板。
- 可使用水墨山水、亭台、江月、秋树、远山、书院、宫阙、舟水等与正文相关的元素，但装饰不能遮挡文字。
- 整体是明亮、清爽、留白充足的浅色氛围，可用红、蓝、黄作少量 accent。
- 构图要有主次：大标题、正文文本区、留白和意境插画之间要平衡。
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
