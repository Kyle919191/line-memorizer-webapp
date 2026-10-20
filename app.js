const state = {
  dataset: null,
  selectedCharacter: '',
  pageStart: 1,
  pageEnd: 89,
  mode: 'text',
  strictness: 'standard',
  queue: [],
  index: 0,
  listening: false,
  autoPlaying: false,
  mustRepeatAfterDontKnow: false
};

const els = {
  setupPanel: document.getElementById('setupPanel'),
  sessionPanel: document.getElementById('sessionPanel'),
  characterSelect: document.getElementById('characterSelect'),
  startPageInput: document.getElementById('startPageInput'),
  endPageInput: document.getElementById('endPageInput'),
  modeSelect: document.getElementById('modeSelect'),
  strictnessSelect: document.getElementById('strictnessSelect'),
  startBtn: document.getElementById('startBtn'),
  restartBtn: document.getElementById('restartBtn'),
  sessionTitle: document.getElementById('sessionTitle'),
  progressText: document.getElementById('progressText'),
  chatFeed: document.getElementById('chatFeed'),
  myTurnControls: document.getElementById('myTurnControls'),
  answerInput: document.getElementById('answerInput'),
  micBtn: document.getElementById('micBtn'),
  submitBtn: document.getElementById('submitBtn'),
  dontKnowBtn: document.getElementById('dontKnowBtn'),
  continueBtn: document.getElementById('continueBtn'),
  feedback: document.getElementById('feedback'),
  actualLineBox: document.getElementById('actualLineBox')
};

let recognition = null;

init().catch((e) => {
  alert(`初始化失败: ${e.message}`);
  console.error(e);
});

async function init() {
  const resp = await fetch('/api/script');
  if (!resp.ok) throw new Error('无法读取剧本数据');
  state.dataset = await resp.json();
  hydrateCharacterSelect(state.dataset.characters);
  setupSpeechRecognition();
  bindEvents();
}

function hydrateCharacterSelect(characters) {
  const options = characters.map((name) => `<option value="${name}">${name}</option>`).join('');
  els.characterSelect.innerHTML = options;
}

function bindEvents() {
  els.startBtn.addEventListener('click', startSession);
  els.restartBtn.addEventListener('click', resetToSetup);
  els.submitBtn.addEventListener('click', submitAnswer);
  els.dontKnowBtn.addEventListener('click', revealAnswer);
  els.continueBtn.addEventListener('click', gotoNext);
  els.micBtn.addEventListener('click', toggleMic);
}

function startSession() {
  state.selectedCharacter = els.characterSelect.value;
  state.pageStart = Number(els.startPageInput.value || 1);
  state.pageEnd = Number(els.endPageInput.value || 89);
  state.mode = els.modeSelect.value;
  state.strictness = els.strictnessSelect.value || 'standard';

  if (state.pageStart > state.pageEnd) {
    alert('开始页不能大于结束页');
    return;
  }

  state.queue = state.dataset.lines.filter((line) =>
    line.pageStart <= state.pageEnd && line.pageEnd >= state.pageStart
  );

  if (state.queue.length === 0) {
    alert('该页码范围没有可训练台词');
    return;
  }

  state.index = 0;
  state.mustRepeatAfterDontKnow = false;
  els.setupPanel.classList.add('hidden');
  els.sessionPanel.classList.remove('hidden');
  const strictnessLabelMap = {
    loose: '宽松',
    standard: '标准',
    strict: '严格'
  };
  const strictnessLabel = strictnessLabelMap[state.strictness] || '标准';
  els.sessionTitle.textContent = `${state.selectedCharacter}｜第${state.pageStart}-${state.pageEnd}页｜${strictnessLabel}`;
  els.chatFeed.innerHTML = '';
  addSystemBubble('训练开始。其他角色会自动推进，到你时会暂停。');
  autoplayUntilMyTurn();
}

function resetToSetup() {
  stopSpeech();
  if (recognition && state.listening) recognition.stop();
  state.autoPlaying = false;
  state.listening = false;
  state.queue = [];
  state.index = 0;
  els.sessionPanel.classList.add('hidden');
  els.setupPanel.classList.remove('hidden');
}

function getCurrentLine() {
  return state.queue[state.index] || null;
}

function gotoNext() {
  stopSpeech();
  state.index += 1;
  autoplayUntilMyTurn();
}

async function submitAnswer() {
  const line = getCurrentLine();
  if (!line) return;
  const attempt = els.answerInput.value.trim();
  if (!attempt) {
    setFeedback('你还没有输入台词', false);
    return;
  }

  addBubble('me', state.selectedCharacter, attempt);

  if (state.mustRepeatAfterDontKnow) {
    const ok = isRehearsalRepeatPass(line.content, attempt);
    if (ok) {
      state.mustRepeatAfterDontKnow = false;
      setFeedback('✅ 很好，已完成“跟读一遍”。可以继续。', true);
      addBubble('system', '系统', `很好，这一轮通过。标准台词：${line.content}`);
      els.continueBtn.classList.remove('hidden');
    } else {
      setFeedback('❌ 还不够接近，请参考标准台词再说/再输入一遍。', false);
    }
    return;
  }

  setFeedback('正在检查语义...', true, true);
  try {
    const resp = await fetch('/api/check-semantic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected: line.content,
        attempt,
        speaker: state.selectedCharacter,
        strictness: state.strictness
      })
    });
    const result = await resp.json();
    if (result.pass) {
      const reason = result.reason || '语义通过';
      setFeedback(`✅ ${reason}${result.checker ? `（${result.checker}）` : ''}`, true);
      els.actualLineBox.classList.remove('hidden');
      els.actualLineBox.textContent = `标准台词：${line.content}`;
      addBubble('system', '系统', `通过。标准台词：${line.content}`);
      els.continueBtn.classList.remove('hidden');
    } else {
      const reason = result.reason || '语义不通过';
      setFeedback(`❌ ${reason}${result.checker ? `（${result.checker}）` : ''}`, false);
    }
  } catch (error) {
    setFeedback(`❌ 检查失败：${error.message}`, false);
  }
}

function revealAnswer() {
  const line = getCurrentLine();
  if (!line) return;
  state.mustRepeatAfterDontKnow = true;
  setFeedback('已显示标准台词。请根据答案再输入/说一遍，然后点“检查答案”。', true);
  els.actualLineBox.classList.remove('hidden');
  els.actualLineBox.textContent = `标准台词：${line.content}`;
  addBubble('system', '系统', `你选择“我不会”。标准台词：${line.content}\n请你复述一遍（输入或语音）再继续。`);
  els.continueBtn.classList.add('hidden');
}

function clearMyTurnFeedback() {
  els.answerInput.value = '';
  state.mustRepeatAfterDontKnow = false;
  els.feedback.textContent = '';
  els.feedback.className = 'feedback';
  els.actualLineBox.textContent = '';
  els.actualLineBox.classList.add('hidden');
  els.continueBtn.classList.add('hidden');
}

function setFeedback(text, pass, pending = false) {
  els.feedback.textContent = text;
  if (pending) {
    els.feedback.className = 'feedback';
  } else {
    els.feedback.className = `feedback ${pass ? 'pass' : 'fail'}`;
  }
}

function normalizeLite(input) {
  return String(input || '')
    .replace(/\s+/g, '')
    .replace(/[“”"'"'‘’`~!@#$%^&*()_+\-=\[\]{};:\\|,.<>/?，。！？；：“”‘’（）《》、…—]/g, '')
    .toLowerCase();
}

function lcsRatio(a, b) {
  const x = normalizeLite(a);
  const y = normalizeLite(b);
  if (!x || !y) return 0;
  const dp = Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let prev = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j];
      if (x[i - 1] === y[j - 1]) dp[j] = prev + 1;
      else dp[j] = Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[y.length] / Math.max(x.length, y.length);
}

function isRehearsalRepeatPass(expected, attempt) {
  const exact = normalizeLite(expected) === normalizeLite(attempt);
  if (exact) return true;
  return lcsRatio(expected, attempt) >= 0.88;
}

function speakLine(text) {
  if (!('speechSynthesis' in window)) return;
  stopSpeech();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 0.95;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const zhVoice =
    voices.find((v) => v.lang === 'zh-CN' && /Tingting|Xiaoxiao|Yun|Mei-Jia|Sin-ji/i.test(v.name)) ||
    voices.find((v) => v.lang && v.lang.startsWith('zh'));
  if (zhVoice) utter.voice = zhVoice;
  window.speechSynthesis.speak(utter);
}

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    els.micBtn.disabled = true;
    els.micBtn.textContent = '当前浏览器不支持语音输入';
    return;
  }
  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript || '';
    if (!text) return;
    if (els.answerInput.value.trim()) {
      els.answerInput.value += ` ${text}`;
    } else {
      els.answerInput.value = text;
    }
  };
  recognition.onstart = () => {
    state.listening = true;
    els.micBtn.textContent = '停止语音输入';
  };
  recognition.onend = () => {
    state.listening = false;
    els.micBtn.textContent = '语音输入';
  };
}

function toggleMic() {
  if (!recognition) return;
  if (state.listening) {
    recognition.stop();
  } else {
    recognition.start();
  }
}

function updateProgress() {
  const current = Math.min(state.index + 1, state.queue.length);
  els.progressText.textContent = `进度：${current}/${state.queue.length}`;
}

function addSystemBubble(text) {
  addBubble('system', '系统', text);
}

function addBubble(kind, speaker, content) {
  const row = document.createElement('div');
  row.className = `bubbleRow ${kind}`;
  const bubble = document.createElement('div');
  bubble.className = `bubble ${kind}`;
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = speaker ? speaker.slice(0, 1) : '系';
  row.appendChild(avatar);
  if (speaker) {
    const sp = document.createElement('span');
    sp.className = 'speaker';
    sp.textContent = speaker;
    bubble.appendChild(sp);
  }
  const body = document.createElement('div');
  body.textContent = content;
  bubble.appendChild(body);
  row.appendChild(bubble);
  els.chatFeed.appendChild(row);
  els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
}

function estimateTextDelayMs(text) {
  const len = String(text || '').length;
  return Math.max(800, Math.min(2600, 700 + len * 28));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speakLineAndWait(text) {
  if (!('speechSynthesis' in window)) return wait(estimateTextDelayMs(text));
  return new Promise((resolve) => {
    stopSpeech();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.95;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const zhVoice =
      voices.find((v) => v.lang === 'zh-CN' && /Tingting|Xiaoxiao|Yun|Mei-Jia|Sin-ji/i.test(v.name)) ||
      voices.find((v) => v.lang && v.lang.startsWith('zh'));
    if (zhVoice) utter.voice = zhVoice;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

async function autoplayUntilMyTurn() {
  if (state.autoPlaying) return;
  state.autoPlaying = true;
  clearMyTurnFeedback();
  els.myTurnControls.classList.add('hidden');
  stopSpeech();

  while (true) {
    const line = getCurrentLine();
    if (!line) {
      updateProgress();
      addSystemBubble('训练完成。');
      els.myTurnControls.classList.add('hidden');
      state.autoPlaying = false;
      return;
    }

    updateProgress();
    const isMyTurn = line.speaker === state.selectedCharacter;

    if (isMyTurn) {
      addBubble('system', '系统', `轮到你：${line.sceneName}（${line.pageStart}-${line.pageEnd}页）`);
      addBubble('system', state.selectedCharacter, '（请说出台词后点击“检查答案”，或点“我不会”）');
      els.myTurnControls.classList.remove('hidden');
      state.autoPlaying = false;
      return;
    }

    addBubble('other', line.speaker, line.content);
    if (state.mode === 'audio') {
      await speakLineAndWait(`${line.speaker}：${line.content}`);
      await wait(280);
    } else {
      await wait(estimateTextDelayMs(line.content));
    }

    state.index += 1;
  }
}

