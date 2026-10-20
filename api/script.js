const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = process.cwd();
const SCRIPT_DIR = path.join(ROOT, '剧本');

const SCENES = [
  { id: '1-1', name: '第一节', file: '第一节.txt', pageStart: 3, pageEnd: 6 },
  { id: '1-2', name: '第二节', file: '第二节.txt', pageStart: 7, pageEnd: 13 },
  { id: '1-3', name: '第三节', file: '第三节.txt', pageStart: 14, pageEnd: 19 },
  { id: '1-4', name: '第四节', file: '第四节.txt', pageStart: 20, pageEnd: 23 },
  { id: '1-5', name: '第五节', file: '第五节.txt', pageStart: 24, pageEnd: 35 },
  { id: '1-6', name: '第六节', file: '第六节.txt', pageStart: 36, pageEnd: 47 },
  { id: '1-7', name: '第六小节', file: '第六小节.txt', pageStart: 48, pageEnd: 55 },
  { id: '1-8', name: '第七节', file: '第七节.txt', pageStart: 56, pageEnd: 61 },
  { id: '1-9', name: '第八节', file: '第八节.txt', pageStart: 62, pageEnd: 64 },
  { id: '1-10', name: '第九节', file: '第九节.txt', pageStart: 65, pageEnd: 69 },
  { id: '1-11', name: '第十节', file: '第十节.txt', pageStart: 70, pageEnd: 74 },
  { id: '1-12', name: '第十一节', file: '第十一节.txt', pageStart: 75, pageEnd: 80 },
  { id: '1-13', name: '第十二节', file: '第十二节.txt', pageStart: 81, pageEnd: 89 }
];

const SPEAKER_ALIASES = {
  '罗杰斯': '罗杰斯',
  '纳拉科特': '纳拉科特',
  '罗杰斯太太': '罗杰斯太太',
  '薇拉': '薇拉·克雷松',
  '薇拉·克雷松': '薇拉·克雷松',
  '维拉': '薇拉·克雷松',
  '隆巴德': '菲利普·隆巴德',
  '菲利普·隆巴德': '菲利普·隆巴德',
  '马斯顿': '安东尼·马斯顿',
  '安东尼·马斯顿': '安东尼·马斯顿',
  '布洛尔': '威廉·布洛尔',
  '威廉·布洛尔': '威廉·布洛尔',
  '麦克阿瑟': '麦克阿瑟将军',
  '麦克阿瑟将军': '麦克阿瑟将军',
  '埃米莉': '埃米莉·布伦特',
  '埃米莉·布伦特': '埃米莉·布伦特',
  '沃格雷弗': '劳伦斯·沃格雷弗爵士',
  '劳伦斯·沃格雷弗爵士': '劳伦斯·沃格雷弗爵士',
  '阿姆斯特朗': '阿姆斯特朗医生',
  '阿姆斯特朗医生': '阿姆斯特朗医生',
  '声音': '声音'
};

const SPEAKER_PATTERN = new RegExp(
  `(${Object.keys(SPEAKER_ALIASES)
    .sort((a, b) => b.length - a.length)
    .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})：`,
  'g'
);

function parseSceneDialogues(rawText, scene) {
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, '\n')
    .split('\n')
    .filter((line, idx) => !(idx === 0 && /^第\s*\d+\s*(小节|节)\s*$/.test(line.trim())))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const matches = Array.from(text.matchAll(SPEAKER_PATTERN));
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    const rawSpeaker = current[1];
    const speaker = SPEAKER_ALIASES[rawSpeaker] || rawSpeaker;
    const start = current.index + current[0].length;
    const end = next ? next.index : text.length;
    const content = text.slice(start, end).trim();
    if (!content) continue;
    out.push({
      sceneId: scene.id,
      sceneName: scene.name,
      pageStart: scene.pageStart,
      pageEnd: scene.pageEnd,
      speaker,
      content
    });
  }
  return out;
}

async function buildScriptDataset() {
  const allLines = [];
  for (const scene of SCENES) {
    const fullPath = path.join(SCRIPT_DIR, scene.file);
    const raw = await fs.readFile(fullPath, 'utf-8');
    const lines = parseSceneDialogues(raw, scene);
    lines.forEach((line, idx) => {
      allLines.push({ ...line, indexInScene: idx + 1, globalIndex: allLines.length + 1 });
    });
  }
  const characters = [...new Set(allLines.map((l) => l.speaker))];
  return { scenes: SCENES, characters, lines: allLines };
}

module.exports = async function handler(_req, res) {
  try {
    const data = await buildScriptDataset();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(data);
  } catch (error) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).send({ error: 'Failed to build script dataset', detail: String(error) });
  }
};
