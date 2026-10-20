function stripParenthetical(input) {
  let text = String(input || '');
  const patterns = [
    /（[^（）]*）/g,
    /\([^()]*\)/g,
    /【[^【】]*】/g,
    /\[[^\[\]]*\]/g
  ];
  for (let i = 0; i < 6; i++) {
    const next = patterns.reduce((acc, p) => acc.replace(p, ''), text);
    if (next === text) break;
    text = next;
  }
  return text;
}

function normalizeText(input) {
  return stripParenthetical(input)
    .replace(/\s+/g, '')
    .replace(/[“”"'‘’`~!@#$%^&*()_+\-=\[\]{};:\\|,.<>/?，。！？；：、…—《》【】·]/g, '')
    .toLowerCase();
}

function lcsRatio(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  const dp = Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let prev = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j];
      if (x[i - 1] === y[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = tmp;
    }
  }
  return dp[y.length] / Math.max(x.length, y.length);
}

function charSetRatio(a, b) {
  const x = new Set(normalizeText(a).split(''));
  const y = new Set(normalizeText(b).split(''));
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const ch of x) {
    if (y.has(ch)) inter += 1;
  }
  const union = new Set([...x, ...y]).size;
  return union ? inter / union : 0;
}

function resolveStrictnessThreshold(level) {
  if (level === 'loose') return 0.34;
  if (level === 'strict') return 0.56;
  return 0.42;
}

function localSemanticCheck(expected, attempt, strictness) {
  const normExpected = normalizeText(expected);
  const normAttempt = normalizeText(attempt);
  if (!normExpected || !normAttempt) {
    return {
      pass: false,
      score: 0,
      reason: '输入为空或无有效文本',
      checker: 'local'
    };
  }

  const lcs = lcsRatio(expected, attempt);
  const charset = charSetRatio(expected, attempt);
  const containsBonus =
    normExpected.includes(normAttempt) || normAttempt.includes(normExpected) ? 0.08 : 0;
  const score = Math.min(1, Math.max(lcs, charset * 0.92 + lcs * 0.18) + containsBonus);
  const threshold = resolveStrictnessThreshold(strictness);
  const pass = score >= threshold;
  const levelLabel = strictness === 'loose' ? '宽松' : strictness === 'strict' ? '严格' : '标准';

  return {
    pass,
    score: Number(score.toFixed(3)),
    reason: pass
      ? `语义接近（本地匹配-${levelLabel}）`
      : `语义差异较大（本地匹配-${levelLabel}）`,
    checker: 'local'
  };
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const payload = await parseBody(req);
    const expected = String(payload.expected || '').trim();
    const attempt = String(payload.attempt || '').trim();
    const strictness = String(payload.strictness || 'standard').trim();

    if (!expected) {
      return res.status(400).json({ error: 'expected is required' });
    }
    if (!attempt) {
      return res.status(200).json({
        pass: false,
        score: 0,
        reason: '你还没有输入台词',
        checker: 'local'
      });
    }

    return res.status(200).json(localSemanticCheck(expected, attempt, strictness));
  } catch (error) {
    return res.status(500).json({ error: 'semantic check failed', detail: String(error) });
  }
};
