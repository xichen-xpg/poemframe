import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const apiKey = process.env.OPENAI_API_KEY;

const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const generationSize = process.env.OPENAI_IMAGE_SIZE ?? "1280x768";
const dailyOutputFile = path.join(repoRoot, "每日古诗词.png");

const gaokaoPoems = [
  { title: "劝学", author: "荀子" },
  { title: "逍遥游", author: "庄子" },
  { title: "师说", author: "韩愈" },
  { title: "阿房宫赋", author: "杜牧" },
  { title: "赤壁赋", author: "苏轼" },
  { title: "氓", author: "《诗经》" },
  { title: "离骚", author: "屈原" },
  { title: "蜀道难", author: "李白" },
  { title: "登高", author: "杜甫" },
  { title: "琵琶行", author: "白居易" },
  { title: "锦瑟", author: "李商隐" },
  { title: "虞美人", author: "李煜" },
  { title: "念奴娇·赤壁怀古", author: "苏轼" },
  { title: "永遇乐·京口北固亭怀古", author: "辛弃疾" },
  { title: "关雎", author: "《诗经》" },
  { title: "蒹葭", author: "《诗经》" },
  { title: "早春呈水部张十八员外", author: "韩愈" },
  { title: "观沧海", author: "曹操" },
  { title: "饮酒", author: "陶渊明" },
  { title: "木兰诗", author: "乐府诗集" },
  { title: "送杜少府之任蜀州", author: "王勃" },
  { title: "登幽州台歌", author: "陈子昂" },
  { title: "次北固山下", author: "王湾" },
  { title: "使至塞上", author: "王维" },
  { title: "闻王昌龄左迁龙标遥有此寄", author: "李白" },
  { title: "行路难", author: "李白" },
  { title: "观刈麦", author: "白居易" },
  { title: "望岳", author: "杜甫" },
  { title: "春望", author: "杜甫" },
  { title: "茅屋为秋风所破歌", author: "杜甫" },
  { title: "白雪歌送武判官归京", author: "岑参" },
  { title: "酬乐天扬州初逢席上见赠", author: "刘禹锡" },
  { title: "卖炭翁", author: "白居易" },
  { title: "钱塘湖春行", author: "白居易" },
  { title: "雁门太守行", author: "李贺" },
  { title: "赤壁", author: "杜牧" },
  { title: "泊秦淮", author: "杜牧" },
  { title: "夜雨寄北", author: "李商隐" },
  { title: "无题", author: "李商隐" },
  { title: "相见欢", author: "李煜" },
  { title: "渔家傲·秋思", author: "范仲淹" },
  { title: "浣溪沙", author: "晏殊" },
  { title: "登飞来峰", author: "王安石" },
  { title: "江城子·密州出猎", author: "苏轼" },
  { title: "水调歌头", author: "苏轼" },
  { title: "游山西村", author: "陆游" },
  { title: "南乡子·登京口北固亭有怀", author: "辛弃疾" },
  { title: "破阵子·为陈同甫赋壮词以寄之", author: "辛弃疾" },
  { title: "过零丁洋", author: "文天祥" },
  { title: "天净沙·秋思", author: "马致远" },
  { title: "山坡羊·潼关怀古", author: "张养浩" },
  { title: "己亥杂诗", author: "龚自珍" },
  { title: "满江红", author: "秋瑾" },
  { title: "论语十二则", author: "《论语》" },
  { title: "曹刿论战", author: "《左传》" },
  { title: "鱼我所欲也", author: "孟子" },
  { title: "河中石兽", author: "纪昀" },
  { title: "生于忧患，死于安乐", author: "孟子" },
  { title: "得道多助，失道寡助", author: "孟子" },
  { title: "列子一则", author: "《列子》" },
  { title: "邹忌讽齐王纳谏", author: "《战国策》" },
  { title: "出师表", author: "诸葛亮" },
  { title: "桃花源记", author: "陶渊明" },
  { title: "答谢中书书", author: "陶弘景" },
  { title: "三峡", author: "郦道元" },
  { title: "马说", author: "韩愈" },
  { title: "陋室铭", author: "刘禹锡" },
  { title: "小石潭记", author: "柳宗元" },
  { title: "岳阳楼记", author: "范仲淹" },
  { title: "醉翁亭记", author: "欧阳修" },
  { title: "爱莲说", author: "周敦颐" },
  { title: "记承天寺夜游", author: "苏轼" },
  { title: "送东阳马生序", author: "宋濂" },
  { title: "湖心亭看雪", author: "张岱" },
  { title: "富贵不能淫", author: "孟子" }
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
生成一张完整的中国古诗文海报。

指定篇目：
- 诗名：《${selectedPoem.title}》
- 作者：${selectedPoem.author}

硬性要求：
- 画面比例为 5:3，适合最终缩放为 800x480 横向电子相框图片。
- 海报中必须包含篇名、作者、篇目正文。
- 正文必须对应指定篇目，不要选择其他作品。
- 不要包含译文、注释、赏析、英文、拼音、二维码、水印、logo 或日期。
- 中文文字必须清晰、端正、可读，避免错字、漏字和乱码。
- 字体要明显偏大，适合 800x480 小尺寸屏幕远距离阅读，不要使用过小正文。
- 正文必须使用常规横排中文排版，阅读顺序从左到右、从上到下，不要竖排、倒排或书法式散排。
- 排版必须稳定、留白充足。
- 背景与篇目意境一致，典雅、克制、有中国古典审美。
- 整体画面需要有蓝色氛围，并用红色、黄色作为少量点缀，色彩不要杂乱。
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
