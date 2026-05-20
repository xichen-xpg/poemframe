import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const apiKey = process.env.OPENAI_API_KEY;

const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const generationSize = process.env.OPENAI_IMAGE_SIZE ?? "1280x768";
const requestTimeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS ?? 5 * 60 * 1000);
const dailyOutputFile = path.join(repoRoot, "每日古诗词.png");

const gaokaoPoems = [
  { title: "劝学", author: "荀子", excerptStart: "君子曰：学不可以已", excerptEnd: "用心躁也" },
  { title: "逍遥游", author: "庄子", excerptStart: "北冥有鱼，其名为鲲", excerptEnd: "圣人无名" },
  { title: "师说", author: "韩愈", excerptStart: "古之学者必有师", excerptEnd: "余嘉其能行古道" },
  { title: "阿房宫赋", author: "杜牧", excerptStart: "六王毕，四海一", excerptEnd: "亦使后人而复哀后人也" },
  { title: "赤壁赋", author: "苏轼", excerptStart: "壬戌之秋，七月既望", excerptEnd: "不知东方之既白" },
  { title: "氓", author: "《诗经》", excerptStart: "氓之蚩蚩", excerptEnd: "亦已焉哉" },
  { title: "离骚", author: "屈原", excerptStart: "帝高阳之苗裔兮", excerptEnd: "来吾道夫先路" },
  { title: "蜀道难", author: "李白", excerptStart: "噫吁嚱", excerptEnd: "侧身西望长咨嗟" },
  { title: "登高", author: "杜甫", excerptStart: "风急天高猿啸哀", excerptEnd: "潦倒新停浊酒杯" },
  { title: "琵琶行", author: "白居易", excerptStart: "浔阳江头夜送客", excerptEnd: "江州司马青衫湿" },
  { title: "锦瑟", author: "李商隐", excerptStart: "锦瑟无端五十弦", excerptEnd: "只是当时已惘然" },
  { title: "虞美人", author: "李煜", excerptStart: "春花秋月何时了", excerptEnd: "恰似一江春水向东流" },
  { title: "念奴娇·赤壁怀古", author: "苏轼", excerptStart: "大江东去", excerptEnd: "一尊还酹江月" },
  { title: "永遇乐·京口北固亭怀古", author: "辛弃疾", excerptStart: "千古江山", excerptEnd: "一片神鸦社鼓" },
  { title: "关雎", author: "《诗经》", excerptStart: "关关雎鸠", excerptEnd: "钟鼓乐之" },
  { title: "蒹葭", author: "《诗经》", excerptStart: "蒹葭苍苍", excerptEnd: "宛在水中沚" },
  { title: "早春呈水部张十八员外", author: "韩愈", excerptStart: "天街小雨润如酥", excerptEnd: "绝胜烟柳满皇都" },
  { title: "观沧海", author: "曹操", excerptStart: "东临碣石", excerptEnd: "歌以咏志" },
  { title: "饮酒", author: "陶渊明", excerptStart: "结庐在人境", excerptEnd: "欲辨已忘言" },
  { title: "木兰诗", author: "乐府诗集", excerptStart: "唧唧复唧唧", excerptEnd: "安能辨我是雄雌" },
  { title: "送杜少府之任蜀州", author: "王勃", excerptStart: "城阙辅三秦", excerptEnd: "儿女共沾巾" },
  { title: "登幽州台歌", author: "陈子昂", excerptStart: "前不见古人", excerptEnd: "独怆然而涕下" },
  { title: "次北固山下", author: "王湾", excerptStart: "客路青山外", excerptEnd: "归雁洛阳边" },
  { title: "使至塞上", author: "王维", excerptStart: "单车欲问边", excerptEnd: "都护在燕然" },
  { title: "闻王昌龄左迁龙标遥有此寄", author: "李白", excerptStart: "杨花落尽子规啼", excerptEnd: "随君直到夜郎西" },
  { title: "行路难", author: "李白", excerptStart: "金樽清酒斗十千", excerptEnd: "直挂云帆济沧海" },
  { title: "观刈麦", author: "白居易", excerptStart: "田家少闲月", excerptEnd: "尽日不能忘" },
  { title: "望岳", author: "杜甫", excerptStart: "岱宗夫如何", excerptEnd: "一览众山小" },
  { title: "春望", author: "杜甫", excerptStart: "国破山河在", excerptEnd: "浑欲不胜簪" },
  { title: "茅屋为秋风所破歌", author: "杜甫", excerptStart: "八月秋高风怒号", excerptEnd: "吾庐独破受冻死亦足" },
  { title: "白雪歌送武判官归京", author: "岑参", excerptStart: "北风卷地白草折", excerptEnd: "雪上空留马行处" },
  { title: "酬乐天扬州初逢席上见赠", author: "刘禹锡", excerptStart: "巴山楚水凄凉地", excerptEnd: "暂凭杯酒长精神" },
  { title: "卖炭翁", author: "白居易", excerptStart: "卖炭翁，伐薪烧炭南山中", excerptEnd: "系向牛头充炭直" },
  { title: "钱塘湖春行", author: "白居易", excerptStart: "孤山寺北贾亭西", excerptEnd: "绿杨阴里白沙堤" },
  { title: "雁门太守行", author: "李贺", excerptStart: "黑云压城城欲摧", excerptEnd: "提携玉龙为君死" },
  { title: "赤壁", author: "杜牧", excerptStart: "折戟沉沙铁未销", excerptEnd: "铜雀春深锁二乔" },
  { title: "泊秦淮", author: "杜牧", excerptStart: "烟笼寒水月笼沙", excerptEnd: "隔江犹唱后庭花" },
  { title: "夜雨寄北", author: "李商隐", excerptStart: "君问归期未有期", excerptEnd: "却话巴山夜雨时" },
  { title: "无题", author: "李商隐", excerptStart: "相见时难别亦难", excerptEnd: "青鸟殷勤为探看" },
  { title: "相见欢", author: "李煜", excerptStart: "无言独上西楼", excerptEnd: "别是一般滋味在心头" },
  { title: "渔家傲·秋思", author: "范仲淹", excerptStart: "塞下秋来风景异", excerptEnd: "将军白发征夫泪" },
  { title: "浣溪沙", author: "晏殊", excerptStart: "一曲新词酒一杯", excerptEnd: "似曾相识燕归来" },
  { title: "登飞来峰", author: "王安石", excerptStart: "飞来山上千寻塔", excerptEnd: "自缘身在最高层" },
  { title: "江城子·密州出猎", author: "苏轼", excerptStart: "老夫聊发少年狂", excerptEnd: "西北望，射天狼" },
  { title: "水调歌头", author: "苏轼", excerptStart: "明月几时有", excerptEnd: "千里共婵娟" },
  { title: "游山西村", author: "陆游", excerptStart: "莫笑农家腊酒浑", excerptEnd: "拄杖无时夜叩门" },
  { title: "南乡子·登京口北固亭有怀", author: "辛弃疾", excerptStart: "何处望神州", excerptEnd: "坐断东南战未休" },
  { title: "破阵子·为陈同甫赋壮词以寄之", author: "辛弃疾", excerptStart: "醉里挑灯看剑", excerptEnd: "可怜白发生" },
  { title: "过零丁洋", author: "文天祥", excerptStart: "辛苦遭逢起一经", excerptEnd: "留取丹心照汗青" },
  { title: "天净沙·秋思", author: "马致远", excerptStart: "枯藤老树昏鸦", excerptEnd: "断肠人在天涯" },
  { title: "山坡羊·潼关怀古", author: "张养浩", excerptStart: "峰峦如聚", excerptEnd: "亡，百姓苦" },
  { title: "己亥杂诗", author: "龚自珍", excerptStart: "浩荡离愁白日斜", excerptEnd: "化作春泥更护花" },
  { title: "满江红", author: "秋瑾", excerptStart: "小住京华", excerptEnd: "青衫湿" },
  { title: "论语十二则", author: "《论语》", excerptStart: "学而时习之", excerptEnd: "切问而近思" },
  { title: "曹刿论战", author: "《左传》", excerptStart: "十年春，齐师伐我", excerptEnd: "遂逐齐师" },
  { title: "鱼我所欲也", author: "孟子", excerptStart: "鱼，我所欲也", excerptEnd: "此之谓失其本心" },
  { title: "河中石兽", author: "纪昀", excerptStart: "沧州南一寺临河干", excerptEnd: "可据理臆断欤" },
  { title: "生于忧患，死于安乐", author: "孟子", excerptStart: "舜发于畎亩之中", excerptEnd: "然后知生于忧患而死于安乐也" },
  { title: "得道多助，失道寡助", author: "孟子", excerptStart: "天时不如地利", excerptEnd: "战必胜矣" },
  { title: "列子一则", author: "《列子》", excerptStart: "伯牙善鼓琴", excerptEnd: "吾于何逃声哉" },
  { title: "邹忌讽齐王纳谏", author: "《战国策》", excerptStart: "邹忌修八尺有余", excerptEnd: "战胜于朝廷" },
  { title: "出师表", author: "诸葛亮", excerptStart: "先帝创业未半而中道崩殂", excerptEnd: "不知所言" },
  { title: "桃花源记", author: "陶渊明", excerptStart: "晋太元中，武陵人捕鱼为业", excerptEnd: "后遂无问津者" },
  { title: "答谢中书书", author: "陶弘景", excerptStart: "山川之美，古来共谈", excerptEnd: "未复有能与其奇者" },
  { title: "三峡", author: "郦道元", excerptStart: "自三峡七百里中", excerptEnd: "良多趣味" },
  { title: "马说", author: "韩愈", excerptStart: "世有伯乐，然后有千里马", excerptEnd: "其真不知马也" },
  { title: "陋室铭", author: "刘禹锡", excerptStart: "山不在高，有仙则名", excerptEnd: "何陋之有" },
  { title: "小石潭记", author: "柳宗元", excerptStart: "从小丘西行百二十步", excerptEnd: "乃记之而去" },
  { title: "岳阳楼记", author: "范仲淹", excerptStart: "庆历四年春", excerptEnd: "吾谁与归" },
  { title: "醉翁亭记", author: "欧阳修", excerptStart: "环滁皆山也", excerptEnd: "太守谓谁？庐陵欧阳修也" },
  { title: "爱莲说", author: "周敦颐", excerptStart: "水陆草木之花", excerptEnd: "同予者何人" },
  { title: "记承天寺夜游", author: "苏轼", excerptStart: "元丰六年十月十二日夜", excerptEnd: "但少闲人如吾两人者耳" },
  { title: "送东阳马生序", author: "宋濂", excerptStart: "余幼时即嗜学", excerptEnd: "盖余之勤且艰若此" },
  { title: "湖心亭看雪", author: "张岱", excerptStart: "崇祯五年十二月", excerptEnd: "舟子喃喃曰" },
  { title: "富贵不能淫", author: "孟子", excerptStart: "景春曰", excerptEnd: "此之谓大丈夫" }
];

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
const excerptRangeInstruction =
  selectedPoem.excerptStart && selectedPoem.excerptEnd
    ? `- 节选范围：从「${selectedPoem.excerptStart}」到「${selectedPoem.excerptEnd}」。`
    : "- 正文范围：使用该篇目的高考常见背诵范围。";

const prompt = `
生成一张完整的中国古诗文海报。

指定篇目：
- 诗名：《${selectedPoem.title}》
- 作者：${selectedPoem.author}
${excerptRangeInstruction}

硬性要求：
- 画面比例为 5:3，适合最终缩放为 800x480 横向电子相框图片。
- 海报中必须包含篇名、作者、篇目正文。
- 正文必须对应指定篇目和节选范围，不要选择其他作品或超出节选范围。
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
