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
const dailyOutputFile = path.join(repoRoot, "每日古诗词.png");

const gaokaoPoems = [
  { title: "关雎", author: "《诗经》" },
  { title: "蒹葭", author: "《诗经》" },
  { title: "氓", author: "《诗经》" },
  { title: "静女", author: "《诗经》" },
  { title: "无衣", author: "《诗经》" },
  { title: "离骚", author: "屈原" },
  { title: "短歌行", author: "曹操" },
  { title: "归园田居", author: "陶渊明" },
  { title: "春江花月夜", author: "张若虚" },
  { title: "山居秋暝", author: "王维" },
  { title: "蜀道难", author: "李白" },
  { title: "梦游天姥吟留别", author: "李白" },
  { title: "将进酒", author: "李白" },
  { title: "燕歌行", author: "高适" },
  { title: "登高", author: "杜甫" },
  { title: "蜀相", author: "杜甫" },
  { title: "客至", author: "杜甫" },
  { title: "登岳阳楼", author: "杜甫" },
  { title: "琵琶行", author: "白居易" },
  { title: "李凭箜篌引", author: "李贺" },
  { title: "锦瑟", author: "李商隐" },
  { title: "虞美人", author: "李煜" },
  { title: "念奴娇·赤壁怀古", author: "苏轼" },
  { title: "鹊桥仙", author: "秦观" },
  { title: "声声慢", author: "李清照" },
  { title: "书愤", author: "陆游" },
  { title: "永遇乐·京口北固亭怀古", author: "辛弃疾" },
  { title: "菩萨蛮·书江西造口壁", author: "辛弃疾" }
];

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).formatToParts(new Date());
const dateValue = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
const todayKey = `${dateValue.year}-${dateValue.month}-${dateValue.day}`;
const dayIndex = Math.floor(Date.parse(`${todayKey}T00:00:00Z`) / 86400000);
const selectedPoem = gaokaoPoems[dayIndex % gaokaoPoems.length];

const safeTitle = selectedPoem.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
const poemOutputFile = path.join(repoRoot, `${safeTitle}.png`);

const prompt = `
生成一张完整的中国古诗词海报。

指定篇目：
- 诗名：《${selectedPoem.title}》
- 作者：${selectedPoem.author}

硬性要求：
- 画面比例为 5:3，适合最终缩放为 800x480 横向电子相框图片。
- 海报中必须包含诗名、作者、诗词正文。
- 诗词正文必须对应指定篇目，不要选择其他作品。
- 不要包含译文、注释、赏析、英文、拼音、二维码、水印、logo 或日期。
- 中文文字必须清晰、端正、可读，避免错字、漏字和乱码。
- 字体要明显偏大，适合 800x480 小尺寸屏幕远距离阅读，不要使用过小正文。
- 诗词正文使用竖排或横排均可，但排版必须稳定、留白充足。
- 背景与诗词意境一致，典雅、克制、有中国古典审美。
- 整体画面需要有蓝色氛围，并用红色、黄色作为少量点缀，色彩不要杂乱。
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
