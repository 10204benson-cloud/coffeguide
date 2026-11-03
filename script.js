/* 慢滴手沖：互動功能
   1. 器材清單（記住勾選）
   2. 用量計算機
   3. 沖煮計時器與濾杯動畫
   4. 味道調整對照表 */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* 儲存設定（失敗時直接略過，不影響使用） */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* 忽略 */ }
    }
  };

  const fmt = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  /* ---------- 濾杯插圖 ---------- */

  const POT = 'M92 190 H148 V206 C148 214 196 222 196 262 V296 Q196 308 184 308 H56 Q44 308 44 296 V262 C44 222 92 214 92 206 Z';
  const CONE = 'M48 50 L192 50 L136 180 L104 180 Z';

  function dripperSVG(id) {
    return `
<svg class="dripper" viewBox="0 0 240 320" role="img" aria-label="手沖濾杯與分享壺的示意圖">
  <defs>
    <clipPath id="${id}-cone"><path d="${CONE}"/></clipPath>
    <clipPath id="${id}-pot"><path d="${POT}"/></clipPath>
  </defs>
  <g clip-path="url(#${id}-pot)">
    <rect class="pot-fill" x="30" y="190" width="180" height="125"/>
    <g class="drops">
      <circle class="drop" cx="120" cy="190" r="3.2"/>
      <circle class="drop" cx="120" cy="190" r="3.2"/>
      <circle class="drop" cx="120" cy="190" r="3.2"/>
    </g>
    <rect class="liquid" x="30" y="214" width="180" height="96"/>
  </g>
  <path class="pot-line" d="${POT}"/>
  <path class="cone-bg" d="${CONE}"/>
  <path class="ground" d="M91 150 Q120 140 149 150 L136 180 L104 180 Z"/>
  <g clip-path="url(#${id}-cone)">
    <rect class="cone-water" x="40" y="50" width="160" height="130"/>
  </g>
  <path class="cone-line" d="${CONE}"/>
  <rect class="rim" x="42" y="44" width="156" height="8" rx="4"/>
  <rect class="base" x="98" y="180" width="44" height="10" rx="3"/>
  <line class="pour" x1="120" y1="2" x2="120" y2="42"/>
</svg>`;
  }

  $$('[data-dripper]').forEach((mount) => {
    mount.innerHTML = dripperSVG(mount.dataset.dripper);
    const svg = $('svg', mount);
    if (mount.hasAttribute('data-demo')) {
      svg.classList.add('is-demo');
      svg.style.setProperty('--fill', '0.4');
      svg.style.setProperty('--cone', '0.25');
      svg.dataset.pour = 'on';
    }
  });

  const brewSvg = $('[data-dripper="brew"] svg');

  /* ---------- 器材清單 ---------- */

  const gearBoxes = $$('#gear-list input[type="checkbox"]');
  const gearStatus = $('#gear-status');
  const savedGear = store.get('mandi.gear', []);

  gearBoxes.forEach((box) => { box.checked = savedGear.includes(box.id); });

  function updateGear() {
    const required = gearBoxes.filter((b) => b.hasAttribute('data-required'));
    const missing = required.filter((b) => !b.checked).length;
    gearStatus.textContent = missing === 0
      ? '必備器材都有了，可以往下一步。'
      : `還差 ${missing} 項必備器材。`;
    store.set('mandi.gear', gearBoxes.filter((b) => b.checked).map((b) => b.id));
  }

  gearBoxes.forEach((box) => box.addEventListener('change', updateGear));
  updateGear();

  /* ---------- 用量計算機 ---------- */

  const ROAST_TEMP = { light: 93, medium: 91, dark: 87 };
  const WATER_PER_CUP = 240;

  const form = $('#calc-form');
  let recipe = { coffee: 15, water: 240 };

  function readForm() {
    const data = new FormData(form);
    return {
      cups: Number(data.get('cups')),
      ratio: Number(data.get('ratio')),
      roast: String(data.get('roast'))
    };
  }

  function applyForm(saved) {
    Object.entries(saved).forEach(([name, value]) => {
      const input = $(`input[name="${name}"][value="${value}"]`, form);
      if (input) input.checked = true;
    });
  }

  function updateCalc() {
    const s = readForm();
    store.set('mandi.calc', s);

    const water = s.cups * WATER_PER_CUP;
    const coffee = Math.round((water / s.ratio) * 2) / 2; /* 取到 0.5 克 */
    recipe = { coffee, water };

    $('#r-coffee').textContent = coffee;
    $('#r-water').textContent = water;
    $('#r-temp').textContent = ROAST_TEMP[s.roast];
    $('#r-bloom').textContent = Math.round(coffee * 2);
    $('#r-ratio').textContent = '1:' + s.ratio;
    $('#b-coffee').textContent = coffee;
    $('#b-water').textContent = water;

    setPlan();
  }

  /* ---------- 沖煮計時器 ---------- */

  const POUR_RATE = 4.5;   /* 每秒倒幾克 */
  const DRAIN_LAG = 25;    /* 水從濾杯落到壺裡的延遲（秒） */
  const TAIL = 55;         /* 倒完水後等滴完的時間（秒） */
  const POT_CAP = 750;     /* 插圖裡分享壺代表的容量（克） */

  let plan = null;
  let elapsed = 0;
  let running = false;
  let lastStamp = 0;
  let raf = 0;
  let lastIdx = -2;
  let wakeLock = null;
  let audio = null;

  function buildPlan(coffee, water) {
    const bloom = Math.round(coffee * 2);
    const first = Math.round(water * 0.6);
    const d0 = Math.max(6, Math.round(bloom / POUR_RATE));
    const t1 = 30;
    const d1 = Math.round((first - bloom) / POUR_RATE);
    const t2 = t1 + d1 + 20;
    const d2 = Math.round((water - first) / POUR_RATE);
    const pourEnd = t2 + d2;
    return { coffee, water, bloom, first, d0, t1, d1, t2, d2, pourEnd, end: pourEnd + TAIL };
  }

  function poured(p, t) {
    if (t <= 0) return 0;
    if (t < p.d0) return p.bloom * (t / p.d0);
    if (t < p.t1) return p.bloom;
    if (t < p.t1 + p.d1) return p.bloom + (p.first - p.bloom) * ((t - p.t1) / p.d1);
    if (t < p.t2) return p.first;
    if (t < p.t2 + p.d2) return p.first + (p.water - p.first) * ((t - p.t2) / p.d2);
    return p.water;
  }

  function isPouring(p, t) {
    return t < p.d0
      || (t >= p.t1 && t < p.t1 + p.d1)
      || (t >= p.t2 && t < p.t2 + p.d2);
  }

  function stepIndex(p, t) {
    if (t >= p.end) return 4;
    if (t >= p.pourEnd) return 3;
    if (t >= p.t2) return 2;
    if (t >= p.t1) return 1;
    return 0;
  }

  const stepsEl = $('#steps');
  const clockEl = $('#clock');
  const waterEl = $('#water');
  const startBtn = $('#start');
  const resetBtn = $('#reset');
  const doneEl = $('#done');
  const announceEl = $('#announce');

  let stepInfo = [];

  function renderSteps() {
    const p = plan;
    stepInfo = [
      {
        time: 0,
        name: '悶蒸',
        text: `慢慢倒入 ${p.bloom} 克水，把粉全部沖濕，然後靜置。粉面會鼓起來，那是氣體跑出來。`,
        target: `${p.bloom} 克`
      },
      {
        time: p.t1,
        name: '第一次注水',
        text: `從中心開始，慢慢畫圈往外，再回到中心，倒到 ${p.first} 克。`,
        target: `${p.first} 克`
      },
      {
        time: p.t2,
        name: '第二次注水',
        text: `同樣畫圈，倒到 ${p.water} 克。水柱保持細，盡量別沖到濾紙邊緣。`,
        target: `${p.water} 克`
      },
      {
        time: p.pourEnd,
        name: '等它滴完',
        text: '不用再倒水。水面快見底，就把濾杯移開。',
        target: `約 ${fmt(p.end)} 完成`
      }
    ];

    stepsEl.innerHTML = stepInfo.map((s) => `
      <li class="step">
        <span class="step__time">${fmt(s.time)}</span>
        <div>
          <h4>${s.name}</h4>
          <p>${s.text}</p>
        </div>
        <span class="step__target">${s.target}</span>
      </li>`).join('');
  }

  function markSteps(idx) {
    $$('.step', stepsEl).forEach((li, i) => {
      li.classList.toggle('is-active', i === idx);
      li.classList.toggle('is-done', i < idx);
      if (i === idx) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  function beep() {
    if (!$('#beep').checked || !audio) return;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.18);
    } catch (e) { /* 忽略 */ }
  }

  function updateButton() {
    if (running) startBtn.textContent = '暫停';
    else if (elapsed >= plan.end) startBtn.textContent = '再沖一次';
    else if (elapsed > 0) startBtn.textContent = '繼續';
    else startBtn.textContent = '開始計時';
  }

  function render() {
    const t = elapsed;
    const p = poured(plan, t);
    const drained = poured(plan, t - DRAIN_LAG) * (plan.water - 2 * plan.coffee) / plan.water;
    const cone = Math.max(0, Math.min(1, (p - drained) / (plan.water * 0.55)));

    clockEl.textContent = fmt(t);
    waterEl.textContent = Math.round(p);

    brewSvg.style.setProperty('--fill', Math.min(1, drained / POT_CAP).toFixed(3));
    brewSvg.style.setProperty('--cone', cone.toFixed(3));
    brewSvg.dataset.pour = running && isPouring(plan, t) ? 'on' : 'off';
    brewSvg.dataset.flow = running && t > 4 && t < plan.end ? 'on' : 'off';

    const idx = (t === 0 && !running) ? -1 : stepIndex(plan, t);
    if (idx !== lastIdx) {
      markSteps(idx);
      if (idx >= 0 && idx < 4) {
        announceEl.textContent = `現在是${stepInfo[idx].name}，${stepInfo[idx].target}`;
        if (running && lastIdx >= 0 && idx > lastIdx) beep();
      }
      lastIdx = idx;
    }
    doneEl.hidden = t < plan.end;
    updateButton();
  }

  function tick(stamp) {
    if (!running) return;
    elapsed += (stamp - lastStamp) / 1000;
    lastStamp = stamp;
    if (elapsed >= plan.end) {
      elapsed = plan.end;
      running = false;
      unlockScreen();
      beep();
    }
    render();
    if (running) raf = requestAnimationFrame(tick);
  }

  async function lockScreen() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* 不支援或被拒絕時略過 */ }
  }

  function unlockScreen() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* 忽略 */ }
    wakeLock = null;
  }

  function start() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 忽略 */ }
    }
    if (audio && audio.state === 'suspended') audio.resume();
    running = true;
    lastStamp = performance.now();
    lockScreen();
    raf = requestAnimationFrame(tick);
    render();
  }

  function pause() {
    running = false;
    cancelAnimationFrame(raf);
    unlockScreen();
    render();
  }

  function reset() {
    running = false;
    cancelAnimationFrame(raf);
    unlockScreen();
    elapsed = 0;
    lastIdx = -2;
    render();
  }

  function setPlan() {
    plan = buildPlan(recipe.coffee, recipe.water);
    renderSteps();
    reset();
  }

  startBtn.addEventListener('click', () => {
    if (running) {
      pause();
    } else if (elapsed >= plan.end) {
      reset();
      start();
    } else {
      start();
    }
  });

  resetBtn.addEventListener('click', reset);

  document.addEventListener('visibilitychange', () => {
    if (running && document.visibilityState === 'visible') lockScreen();
  });

  applyForm(store.get('mandi.calc', {}));
  form.addEventListener('change', updateCalc);
  updateCalc();

  /* ---------- 味道調整 ---------- */

  const FIXES = {
    sour: {
      title: '太酸、很尖銳',
      why: '通常是萃取不足，味道還沒被水帶出來。',
      steps: [
        '研磨調細一點點',
        '水溫提高 2 度',
        '第二次注水慢一點，讓總時間多 15 到 20 秒'
      ]
    },
    thin: {
      title: '水水的、沒味道',
      why: '可能是咖啡粉太少，或水流得太快。',
      steps: [
        '粉量加 1 到 2 克，水量不變',
        '研磨調細一點點',
        '悶蒸時多等 10 秒'
      ]
    },
    heavy: {
      title: '悶悶的、不清爽',
      why: '通常是萃取偏多，或粉泥堵住了濾紙。',
      steps: [
        '研磨調粗一點點',
        '注水時圈子小一點，不要用力攪動粉層',
        '粉量減 1 克'
      ]
    },
    bitter: {
      title: '太苦、澀澀的',
      why: '通常是過度萃取，連不好的味道也被帶出來了。',
      steps: [
        '研磨調粗一點點',
        '水溫降 2 到 3 度',
        '水柱再細一點，少沖到濾紙邊緣的粉'
      ]
    }
  };

  const fixButtons = $$('.fix__buttons button');
  const fixAnswer = $('#fix-answer');
  const mark = $('#mark');

  fixButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = FIXES[btn.dataset.key];
      fixButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      mark.style.left = btn.dataset.pos + '%';
      fixAnswer.innerHTML = `
        <h3>${item.title}</h3>
        <p class="fix__why">${item.why}</p>
        <p>下一杯從這三項裡挑一項來改：</p>
        <ul>${item.steps.map((s) => `<li>${s}</li>`).join('')}</ul>
        <p class="fix__tip">改完再喝一次，比較兩杯的差別。</p>`;
    });
  });
})();
