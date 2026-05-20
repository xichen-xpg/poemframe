import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required.");
}

const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const generationSize = process.env.OPENAI_IMAGE_SIZE ?? "1280x768";
const outputFile = path.join(repoRoot, "每日古诗词.png");

const formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "long"
});
const today = formatter.format(new Date());

const prompt = `
生成一张完整的中国古诗词海报，今天日期是 ${today}。

硬性要求：
- 画面比例为 5:3，适合最终缩放为 800x480 横向电子相框图片。
- 请自行选择一首中国高考语文大纲或课程标准常见必背篇目中的公版古诗词。
- 海报中必须包含诗名、作者、诗词正文。
- 不要包含译文、注释、赏析、英文、拼音、二维码、水印、logo 或日期。
- 中文文字必须清晰、端正、可读，避免错字、漏字和乱码。
- 诗词正文使用竖排或横排均可，但排版必须稳定、留白充足。
- 背景与诗词意境一致，典雅、克制、有中国古典审美。
- 最终图像必须是一张已经完成渲染的海报，不要输出分镜、草图或说明文字。
`;

const response = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model,
    prompt,
    size: generationSize,
    n: 1
  })
});

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
await fs.mkdir(path.dirname(outputFile), { recursive: true });
await sharp(imageBuffer)
  .resize(800, 480, {
    fit: "cover",
    position: "center"
  })
  .png()
  .toFile(outputFile);

console.log(`Generated ${outputFile}`);
