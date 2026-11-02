/* =====================================================================
   ui.js — THE VIEW + CONTROLLER. Rendering only, no game logic.
   ===================================================================== */

let L = null;
let lang = 'en';
let implementer = { name: '', image: 'assets/svg/person-placeholder.svg', custom: false };
const app = () => document.getElementById('app');

const CROSS_SVG = '<svg viewBox="0 0 100 100">' +
  '<line class="under" x1="16" y1="16" x2="84" y2="84"/><line class="under" x1="84" y1="16" x2="16" y2="84"/>' +
  '<line x1="16" y1="16" x2="84" y2="84"/><line x1="84" y1="16" x2="16" y2="84"/></svg>';

/* Built-in implementers. Drop real photos at these paths and they appear
   automatically; until then the placeholder silhouette is used. */
const IMPLEMENTERS = [
  { name: 'Taronish', img: 'assets/img/taronish.jpg' },
  { name: 'Shambhu',  img: 'assets/img/shambhu.jpg' }
];

function t(key, vars) {
  let s = L[key];
  if (s === undefined) return '';
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
  return s;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function screen(nodes, wide) {
  const a = app();
  a.innerHTML = '';
  nodes.forEach(n => { if (n && n.classList && n.classList.contains('prog')) a.appendChild(n); });
  const panel = el('div', 'panel fade' + (wide ? ' wide' : ''));
  nodes.forEach(n => { if (!(n && n.classList && n.classList.contains('prog'))) panel.appendChild(n); });
  a.appendChild(panel);
  return panel;
}

function progress(n) {
  const w = el('div', 'prog');
  w.appendChild(el('div', 'lbl', t('trial_of', { n: n, total: CONFIG.TOTAL_TRIALS })));
  const bar = el('div', 'bar'); const fill = el('span');
  fill.style.width = ((n - 1) / CONFIG.TOTAL_TRIALS * 100) + '%';
  bar.appendChild(fill); w.appendChild(bar);
  return w;
}

/* Swap in the placeholder if a photo file is missing, so the game never
   shows a broken image in front of a class. */
function safeImg(src, cls) {
  const img = el('img', cls);
  img.src = src; img.alt = '';
  img.addEventListener('error', () => { img.src = 'assets/svg/person-placeholder.svg'; });
  return img;
}

/* =====================================================================
   PAGE 1 — Implementer (adult-facing, English)
   ===================================================================== */
function renderImplementer() {
  L = STRINGS.en;
  const nodes = [];
  nodes.push(el('h1', null, 'Before you begin'));
  nodes.push(el('p', 'muted', 'Who is running this session? The photo is shown to the student during three of the twelve rounds.'));

  let selected = null;
  const row = el('div', 'choice-row');
  const opts = IMPLEMENTERS.concat([{ name: 'Someone else', img: null }]);
  const btns = [];

  const customWrap = el('div');
  customWrap.style.display = 'none';
  const lblName = el('label', null, 'Name of the person running the session');
  const inName = el('input');
  const lblPhoto = el('label', null, 'Photo (stays on this device — it is never saved into the exported data)');
  const inPhoto = el('input'); inPhoto.type = 'file'; inPhoto.accept = 'image/*';
  const preview = el('img');
  preview.style.cssText = 'width:78px;height:78px;border-radius:50%;object-fit:cover;margin-top:9px;display:none;border:3px solid var(--accent)';
  inPhoto.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { implementer.image = r.result; preview.src = r.result; preview.style.display = 'block'; };
    r.readAsDataURL(f);
  });
  customWrap.appendChild(lblName); customWrap.appendChild(inName);
  customWrap.appendChild(lblPhoto); customWrap.appendChild(inPhoto); customWrap.appendChild(preview);

  opts.forEach((o, i) => {
    const b = el('button', 'choice');
    if (o.img) { const im = safeImg(o.img); im.style.cssText = 'width:52px;height:52px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 6px'; b.appendChild(im); }
    b.appendChild(el('span', null, o.name));
    b.addEventListener('click', () => {
      btns.forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      selected = i;
      const isCustom = i === opts.length - 1;
      customWrap.style.display = isCustom ? 'block' : 'none';
      if (!isCustom) { implementer = { name: o.name, image: o.img, custom: false }; }
      err.textContent = '';
    });
    btns.push(b); row.appendChild(b);
  });

  const err = el('p', 'muted'); err.style.color = 'var(--bad)';
  const go = el('button', 'btn', 'Continue');
  go.addEventListener('click', () => {
    if (selected === null) { err.textContent = 'Please choose who is running the session.'; return; }
    if (selected === opts.length - 1) {
      if (!inName.value.trim()) { err.textContent = 'Please type the name.'; return; }
      implementer.name = inName.value.trim();
      implementer.custom = true;
      if (!implementer.image || implementer.image.indexOf('assets/img') === 0) {
        implementer.image = 'assets/svg/person-placeholder.svg';
      }
    }
    renderStudent();
  });

  nodes.push(row); nodes.push(customWrap); nodes.push(err); nodes.push(go);

  const sim = el('button', 'btn secondary', 'Check the maths (instructor tool)');
  sim.addEventListener('click', renderSimulation);
  nodes.push(sim);

  screen(nodes);
}

/* =====================================================================
   INSTRUCTOR SIMULATION
   Plays complete 12-round sessions through Engine.buildTrial and
   Engine.executeHostReveal — the exact functions the students play
   against — then tests the results with proper statistics.

   Why statistics rather than fixed tolerances: a correct random process
   still scatters. At 1,200 rounds the standard error on a win rate is
   about 1.4%, so a fixed "must be within 1%" rule fails almost half the
   time on a perfectly good engine. Every check below scales its
   tolerance to the sample size instead.
   ===================================================================== */

/* two-sided tail probability for a standard normal */
function normSF(z) {
  z = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
            t * (-1.821255978 + t * 1.330274429))));
  return 2 * p;
}

/* survival function for chi-square with even degrees of freedom */
function chiSF(x, df) {
  const k = df / 2;
  let term = 1, sum = 1;
  for (let i = 1; i < k; i++) { term *= (x / 2) / i; sum += term; }
  return Math.exp(-x / 2) * sum;
}

/* proportion test: observed successes out of n against an expected rate */
function propTest(label, obs, n, expected) {
  if (!n) return { label: label, na: true };
  const p = obs / n;
  const se = Math.sqrt(expected * (1 - expected) / n);
  const z = (p - expected) / se;
  return {
    label: label, observed: p, expected: expected, n: n, z: z, pval: normSF(z),
    lo: Math.max(0, expected - 2 * se), hi: Math.min(1, expected + 2 * se)
  };
}

/* chi-square goodness of fit against a uniform distribution */
function uniformTest(label, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return { label: label, na: true };
  const exp = total / counts.length;
  let x = 0;
  counts.forEach(c => { x += (c - exp) * (c - exp) / exp; });
  const df = counts.length - 1;
  const pval = chiSF(x, df % 2 === 0 ? df : df + 1);
  return { label: label, counts: counts, total: total, chi: x, df: df, pval: pval };
}

/* Runs full sessions. hostFn lets the power check swap in a broken host
   so we can confirm the tests actually detect a fault. */
function simulateSessions(sessions, switchProb, hostFn) {
  const st = {
    rounds: 0, wins: 0, switched: 0, kept: 0, winsOnSwitch: 0, winsOnKeep: 0,
    prizePos: [0, 0, 0],
    prizeByBlock: { NORMAL_PRE: [0,0,0], COLOUR: [0,0,0], AUTHORITY: [0,0,0], NORMAL_POST: [0,0,0] },
    colourByPos: { RED: [0,0,0], GREEN: [0,0,0], BLUE: [0,0,0] },
    serial: [0,0,0,0,0,0,0,0,0],
    cond: {},
    sessionWins: []
  };
  const savedTrial = Engine.trial, savedTrials = Engine.trials, savedFails = Engine.assertionFailures;
  Engine.trials = []; Engine.assertionFailures = [];

  for (let s = 0; s < sessions; s++) {
    let sw = 0, prev = null;
    for (let n = 1; n <= CONFIG.TOTAL_TRIALS; n++) {
      const T = Engine.buildTrial(n);
      const choice = Math.floor(Math.random() * 3);
      T.initial_choice = choice;
      if (hostFn) hostFn(T); else Engine.executeHostReveal();

      st.rounds++;
      st.prizePos[T.prize_index]++;
      st.prizeByBlock[T.block][T.prize_index]++;
      if (T.colour_map) T.colour_map.forEach((c, i) => st.colourByPos[c][i]++);
      if (prev !== null) st.serial[prev * 3 + T.prize_index]++;
      prev = T.prize_index;

      const key = choice + '' + T.opened_index;
      st.cond[key] = st.cond[key] || { n: 0, w: 0 };
      st.cond[key].n++;
      if (T.alternative_index === T.prize_index) st.cond[key].w++;

      const doSwitch = Math.random() < switchProb;
      const final = doSwitch ? T.alternative_index : choice;
      const won = final === T.prize_index;
      if (won) { st.wins++; sw++; }
      if (doSwitch) { st.switched++; if (won) st.winsOnSwitch++; }
      else { st.kept++; if (won) st.winsOnKeep++; }
    }
    st.sessionWins.push(sw);
  }
  Engine.trial = savedTrial; Engine.trials = savedTrials; Engine.assertionFailures = savedFails;
  return st;
}

function buildChecks(st, switchProb) {
  const expected = 1 / 3 + switchProb / 3;
  const checks = [];
  checks.push(propTest('Overall win rate', st.wins, st.rounds, expected));
  if (st.switched) checks.push(propTest('Win rate when the box was changed', st.winsOnSwitch, st.switched, 2 / 3));
  if (st.kept) checks.push(propTest('Win rate when the box was kept', st.winsOnKeep, st.kept, 1 / 3));
  checks.push(uniformTest('Chocolate spread across Box 1 / 2 / 3', st.prizePos));
  ['NORMAL_PRE', 'COLOUR', 'AUTHORITY', 'NORMAL_POST'].forEach(b => {
    checks.push(uniformTest('Chocolate spread inside the ' + blockLabel(b) + ' rounds', st.prizeByBlock[b]));
  });
  ['RED', 'GREEN', 'BLUE'].forEach(c => {
    checks.push(uniformTest('Where the ' + c.toLowerCase() + ' box appears', st.colourByPos[c]));
  });
  checks.push(uniformTest('No pattern from one round to the next', st.serial));
  const condCells = Object.keys(st.cond).map(k => st.cond[k]);
  const totN = condCells.reduce((a, c) => a + c.n, 0), totW = condCells.reduce((a, c) => a + c.w, 0);
  const condCheck = propTest('No clue in which box the computer opens', totW, totN, 2 / 3);
  condCheck.detail = st.cond;
  checks.push(condCheck);

  /* Family-wise correction. Running many checks at once means some will
     look unusual by chance alone: 12 checks at a 5% threshold produce a
     false alarm about half the time. Dividing the thresholds by the
     number of checks (Bonferroni) keeps the overall false-alarm rate at
     the intended level. Detection power is unaffected here because a
     genuinely broken engine misses by far more than the threshold. */
  const m = checks.filter(c => !c.na).length || 1;
  const redP = 0.0027 / m, amberP = 0.0455 / m;
  checks.forEach(c => {
    if (c.na) { c.level = 'ok'; return; }
    c.level = c.pval < redP ? 'red' : c.pval < amberP ? 'amber' : 'ok';
  });
  return checks;
}

function blockLabel(b) {
  return { NORMAL_PRE: 'first normal', COLOUR: 'colour', AUTHORITY: 'authority', NORMAL_POST: 'last normal' }[b] || b;
}

function binomPMF(n, k, p) {
  let c = 1;
  for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
  return c * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

function renderSimulation() {
  const nodes = [];
  nodes.push(el('h1', null, 'Does the game give the right odds?'));
  nodes.push(el('p', 'muted',
    'This plays complete 12-round sessions against the same code the students play against, then checks the results with proper statistics. Nothing here is recorded in any student data.'));

  const theory = el('div');
  theory.innerHTML =
    '<p style="margin:6px 0"><strong>What the maths says.</strong> After the computer opens an empty box, the chocolate is behind your first box with probability <strong>1/3</strong>, and behind the other box with probability <strong>2/3</strong>. Those are the only two options, so <strong>no strategy can win more than 66.7% of rounds on average</strong>. A student who always changes should win about <strong>8 out of 12</strong>; one who never changes, about <strong>4 out of 12</strong>.</p>';
  nodes.push(theory);

  let switchProb = 1;
  nodes.push(el('label', null, 'Play as a student who…'));
  const row = el('div', 'choice-row');
  const modes = [['Always changes', 1], ['Never changes', 0], ['Changes half the time', 0.5]];
  const mbtns = [];
  modes.forEach((m, i) => {
    const b = el('button', 'choice', m[0]);
    if (i === 0) b.classList.add('on');
    b.addEventListener('click', () => { mbtns.forEach(x => x.classList.remove('on')); b.classList.add('on'); switchProb = m[1]; });
    mbtns.push(b); row.appendChild(b);
  });
  nodes.push(row);

  nodes.push(el('label', null, 'How many students to simulate'));
  const sel = el('select');
  [50, 100, 500, 1000, 10000, 50000].forEach(v => {
    const o = el('option', null, v.toLocaleString() + ' students  (' + (v * 12).toLocaleString() + ' rounds)');
    o.value = String(v); sel.appendChild(o);
  });
  sel.value = '100';
  nodes.push(sel);

  const out = el('div');
  const run = el('button', 'btn', 'Run the simulation');
  run.addEventListener('click', () => {
    run.disabled = true; run.textContent = 'Running…';
    out.innerHTML = '';
    setTimeout(() => {
      const st = simulateSessions(parseInt(sel.value, 10), switchProb, null);
      out.innerHTML = simReport(st, switchProb);
      run.disabled = false; run.textContent = 'Run the simulation';
    }, 30);
  });
  nodes.push(run); nodes.push(out);

  const back = el('button', 'btn secondary', 'Back');
  back.addEventListener('click', renderImplementer);
  nodes.push(back);
  screen(nodes, true);
}

function simReport(st, switchProb) {
  const checks = buildChecks(st, switchProb);
  const reds = checks.filter(c => c.level === 'red').length;
  const ambers = checks.filter(c => c.level === 'amber').length;
  const pct = v => (v * 100).toFixed(2) + '%';
  const expected = 1 / 3 + switchProb / 3;
  const observed = st.wins / st.rounds;

  let head, colour;
  if (reds) {
    colour = 'var(--bad)';
    head = reds + ' check(s) are far outside the expected range. Re-run once; if it repeats, the engine needs attention.';
  } else if (ambers) {
    colour = '#B8860B';
    head = 'All checks are within normal random variation. ' + ambers +
           ' sit near the edge of the expected range — that is ordinary at this sample size. Increase the number of students to narrow the ranges.';
  } else {
    colour = 'var(--good)';
    head = 'All checks passed — the game is giving the correct odds.';
  }

  let h = '<div style="border:2px solid ' + colour + ';border-radius:10px;padding:12px 14px;margin-top:14px">';
  h += '<p style="margin:0 0 4px;font-weight:700;color:' + colour + '">' + head + '</p>';
  h += '<p style="margin:0 0 10px;font-size:13px;color:var(--muted)">Based on ' +
       st.sessionWins.length.toLocaleString() + ' simulated students (' + st.rounds.toLocaleString() +
       ' rounds). Each check compares the result with the theory, allowing for the scatter expected at this sample size.</p>';

  h += '<table style="width:100%;border-collapse:collapse;font-size:14px">';
  h += '<tr style="color:var(--muted);font-size:11px;text-transform:uppercase">' +
       '<th style="text-align:left">Check</th><th style="text-align:right">Observed</th>' +
       '<th style="text-align:right">Expected</th><th style="text-align:right">Normal range</th><th></th></tr>';

  checks.forEach(c => {
    if (c.na) return;
    const mark = c.level === 'red' ? '<span style="color:var(--bad);font-weight:700">✗</span>'
              : c.level === 'amber' ? '<span style="color:#B8860B;font-weight:700">!</span>'
              : '<span style="color:var(--good);font-weight:700">✓</span>';
    const bd = 'border-top:1px solid #EFE7D8;padding:5px 0';
    if (c.counts) {
      const t = c.total;
      h += '<tr><td style="' + bd + '">' + c.label + '</td>' +
           '<td style="' + bd + ';text-align:right;font-weight:700">' + c.counts.map(x => (x / t * 100).toFixed(1) + '%').join(' / ') + '</td>' +
           '<td style="' + bd + ';text-align:right;color:var(--muted)">even</td>' +
           '<td style="' + bd + ';text-align:right;color:var(--muted)">p = ' + c.pval.toFixed(3) + '</td>' +
           '<td style="' + bd + ';text-align:right">' + mark + '</td></tr>';
    } else {
      h += '<tr><td style="' + bd + '">' + c.label + '</td>' +
           '<td style="' + bd + ';text-align:right;font-weight:700">' + pct(c.observed) + '</td>' +
           '<td style="' + bd + ';text-align:right;color:var(--muted)">' + pct(c.expected) + '</td>' +
           '<td style="' + bd + ';text-align:right;color:var(--muted)">' + pct(c.lo) + '–' + pct(c.hi) + '</td>' +
           '<td style="' + bd + ';text-align:right">' + mark + '</td></tr>';
    }
  });
  h += '</table>';
  h += '<p style="margin:10px 0 0;font-size:13px;color:var(--muted)">' +
       '✓ within the normal range &nbsp;·&nbsp; <span style="color:#B8860B">!</span> near the edge, ordinary with small samples &nbsp;·&nbsp; ' +
       '<span style="color:var(--bad)">✗</span> far outside, worth investigating</p>';
  h += '<p style="margin:8px 0 0;font-size:14px">Average chocolates in a 12-round session: <strong>' +
       (observed * 12).toFixed(2) + '</strong> out of 12.</p>';
  h += '</div>';

  /* observed session distribution against theory */
  const hist = new Array(13).fill(0);
  st.sessionWins.forEach(w => hist[w]++);
  const nSess = st.sessionWins.length;
  let best = 0;
  for (let k = 0; k <= 12; k++) best = Math.max(best, binomPMF(12, k, expected), hist[k] / nSess);

  h += '<p style="margin:14px 0 4px;font-weight:700">Wins in a single 12-round session</p>';
  h += '<p style="margin:0 0 8px;font-size:13px;color:var(--muted)">Solid bars are what the simulation produced; the outline is what the maths predicts. One student bounces around a lot — this is the normal spread.</p>';
  h += '<table style="width:100%;font-size:12.5px;border-collapse:collapse">';
  for (let k = 0; k <= 12; k++) {
    const th = binomPMF(12, k, expected), ob = hist[k] / nSess;
    h += '<tr><td style="width:62px;padding:1px 0">' + k + ' wins</td>' +
         '<td style="position:relative;height:15px">' +
         '<div style="position:absolute;left:0;top:1px;height:13px;border:1.5px dashed var(--muted);border-radius:3px;width:' + (th / best * 100).toFixed(1) + '%"></div>' +
         '<div style="position:absolute;left:0;top:3px;height:9px;background:var(--accent);border-radius:2px;width:' + (ob / best * 100).toFixed(1) + '%"></div>' +
         '</td>' +
         '<td style="width:56px;text-align:right;color:var(--muted)">' + (ob * 100).toFixed(1) + '%</td></tr>';
  }
  h += '</table>';
  const near = [Math.round(12 * expected) - 1, Math.round(12 * expected), Math.round(12 * expected) + 1].filter(k => k >= 0 && k <= 12);
  const nearP = near.reduce((a, k) => a + binomPMF(12, k, expected), 0);
  h += '<p style="margin:8px 0 0;font-size:13.5px;color:var(--muted)">About ' + (nearP * 100).toFixed(0) +
       '% of students land between ' + near[0] + ' and ' + near[near.length - 1] + ' wins. ' +
       'Getting 12 out of 12 happens roughly once in ' + Math.round(1 / binomPMF(12, 12, expected)) +
       ' students — rare, but not a fault.</p>';
  return h;
}

/* =====================================================================
   PAGE 2 — Student details
   ===================================================================== */
function renderStudent() {
  const nodes = [];
  const title = el('h1');
  const langLabel = el('label');
  const langSel = el('select');
  LANGUAGES.forEach(g => { const o = el('option', null, g.label); o.value = g.code; langSel.appendChild(o); });
  langSel.value = lang;

  const lblName = el('label'); const inName = el('input');
  const lblSchool = el('label'); const inSchool = el('input');
  const lblClass = el('label'); const selClass = el('select');
  const lblGender = el('label');
  const gRow = el('div', 'choice-row');
  const bM = el('button', 'choice'); const bF = el('button', 'choice');
  let gender = null;
  bM.addEventListener('click', () => { gender = 'MALE'; bM.classList.add('on'); bF.classList.remove('on'); err.textContent = ''; });
  bF.addEventListener('click', () => { gender = 'FEMALE'; bF.classList.add('on'); bM.classList.remove('on'); err.textContent = ''; });
  gRow.appendChild(bM); gRow.appendChild(bF);

  const err = el('p', 'muted'); err.style.color = 'var(--bad)';
  const startBtn = el('button', 'btn');

  function apply() {
    lang = langSel.value;
    L = STRINGS[lang];
    document.documentElement.lang = lang;
    document.title = L.app_title;
    title.textContent = L.student_title;
    langLabel.textContent = L.language_label;
    lblName.textContent = L.name;
    lblSchool.textContent = L.school;
    lblClass.textContent = L.class_label;
    lblGender.textContent = L.gender;
    bM.lastChild.textContent = L.male; bF.lastChild.textContent = L.female;
    startBtn.textContent = L.start_btn;
    err.textContent = '';
    selClass.innerHTML = '';
    const ph = el('option', null, L.select_class); ph.value = ''; selClass.appendChild(ph);
    for (let c = 1; c <= 8; c++) { const o = el('option', null, String(c)); o.value = String(c); selClass.appendChild(o); }
  }
  bM.appendChild(el('span')); bF.appendChild(el('span'));
  langSel.addEventListener('change', apply);

  startBtn.addEventListener('click', () => {
    if (!inName.value.trim() || !inSchool.value.trim() || !selClass.value || !gender) {
      err.textContent = L.fill_all; return;
    }
    Engine.startSession({
      implementer_name: implementer.name,
      implementer_is_custom: implementer.custom,
      student_name: inName.value.trim(),
      school_name: inSchool.value.trim(),
      class_level: parseInt(selClass.value, 10),
      gender: gender,
      language: lang
    });
    renderIntro();
  });

  nodes.push(title, langLabel, langSel, lblName, inName, lblSchool, inSchool,
             lblClass, selClass, lblGender, gRow, err, startBtn);
  screen(nodes);
  apply();
}

/* =====================================================================
   PAGE 3 — Intro
   ===================================================================== */
function renderIntro() {
  const img = el('img', 'result-img'); img.src = 'assets/svg/box-closed.svg'; img.alt = '';
  const h = el('h1', 'center', L.intro_title);
  const p1 = el('p', 'center', L.intro_body);
  const h2 = el('h2', null, L.how_title);
  const p2 = el('p', null, L.how_body);
  const b = el('button', 'btn', L.begin);
  b.addEventListener('click', () => startTrial(1));
  screen([img, h, p1, h2, p2, b]);
}

/* =====================================================================
   TRIAL FLOW
   ===================================================================== */
function startTrial(n) {
  Engine.buildTrial(n);
  renderPick();
}

function boxSrc(T, i, state) {
  if (state === 'prize') return 'assets/svg/box-open-prize.svg';
  if (state === 'empty') return 'assets/svg/box-open-empty.svg';
  if (T.colour_map) return 'assets/svg/box-' + T.colour_map[i].toLowerCase() + '.svg';
  return 'assets/svg/box-closed.svg';
}

function authorityNode() {
  const w = el('div', 'auth');
  w.appendChild(safeImg(implementer.image));
  w.appendChild(el('p', null, t('authority_line', { name: implementer.name })));
  return w;
}

/* ---------- Phase 1: first pick ---------- */
function renderPick() {
  const T = Engine.trial;
  const nodes = [progress(T.trial_index)];
  if (T.authority_shown) nodes.push(authorityNode());
  nodes.push(el('p', 'instruct', L.pick_prompt));

  const row = el('div', 'boxrow');
  for (let i = 0; i < T.box_count; i++) {
    const b = el('button', 'box');
    const im = el('img'); im.src = boxSrc(T, i); im.alt = ''; b.appendChild(im);
    b.appendChild(el('span', 'num', String(i + 1)));
    b.addEventListener('click', () => {
      Engine.recordInitialChoice(i);
      renderOpening();
    });
    row.appendChild(b);
  }
  nodes.push(row);
  screen(nodes);
  Engine.trial.time_start = Date.now();
}

/* ---------- Phase 2: computer opens an empty box ---------- */
function renderOpening() {
  const T = Engine.trial;
  Engine.executeHostReveal();

  const nodes = [progress(T.trial_index)];
  if (T.authority_shown) nodes.push(authorityNode());
  nodes.push(el('div', 'msg', t('picked_msg', { n: T.initial_choice + 1 }) + ' ' + L.opening_msg));

  const row = el('div', 'boxrow');
  const boxes = [];
  for (let i = 0; i < T.box_count; i++) {
    const b = el('button', 'box'); b.disabled = true;
    const im = el('img'); im.src = boxSrc(T, i); im.alt = ''; b.appendChild(im);
    b.appendChild(el('span', 'num', String(i + 1)));
    if (i === T.initial_choice) b.classList.add('chosen');
    row.appendChild(b); boxes.push(b);
  }
  nodes.push(row);
  screen(nodes);

  // Gradual open, then the red cross lands on it.
  setTimeout(() => {
    const b = boxes[T.opened_index];
    b.classList.add('opening', 'dead');
    b.querySelector('img').src = 'assets/svg/box-open-empty.svg';
    const cross = el('div', 'cross');
    cross.innerHTML = CROSS_SVG;
    b.appendChild(cross);
    setTimeout(renderDecide, 1500);
  }, 550);
}

/* ---------- Phase 3: final choice — student taps a box directly ---------- */
function renderDecide() {
  const T = Engine.trial;
  const a = T.initial_choice + 1, bnum = T.alternative_index + 1;
  const nodes = [progress(T.trial_index)];
  if (T.authority_shown) nodes.push(authorityNode());
  nodes.push(el('div', 'msg', t('opened_msg', { n: T.opened_index + 1 })));

  const row = el('div', 'boxrow');
  const live = [];
  for (let i = 0; i < T.box_count; i++) {
    const b = el('button', 'box');
    const im = el('img'); im.alt = '';
    if (i === T.opened_index) {
      im.src = 'assets/svg/box-open-empty.svg';
      b.classList.add('dead'); b.disabled = true;
      b.appendChild(im);
      const cross = el('div', 'cross');
      cross.innerHTML = CROSS_SVG;
      b.appendChild(cross);
    } else {
      im.src = boxSrc(T, i);
      b.appendChild(im);
      // Both remaining boxes look identical — no keep/change buttons,
      // no colour or styling difference between staying and changing.
      b.addEventListener('click', () => {
        Engine.recordFinalChoice(i);
        renderOutcome();
      });
      live.push(b);
    }
    b.appendChild(el('span', 'num', String(i + 1)));
    row.appendChild(b);
  }
  nodes.push(row);
  nodes.push(el('p', 'instruct', t('stay_or_change', { a: a, b: bnum })));
  nodes.push(el('p', 'instruct', L.choose_prompt));
  screen(nodes);

  live.forEach(b => b.disabled = true);
  setTimeout(() => {
    live.forEach(b => b.disabled = false);
    Engine.trial.eval_time_start = Date.now();
  }, CONFIG.LOCKOUT_MS);
}

/* ---------- Phase 4: outcome ---------- */
function renderOutcome() {
  const T = Engine.trial;
  const won = T.trial_outcome === 'WIN';
  const nodes = [progress(T.trial_index)];

  const img = el('img', 'result-img');
  img.src = won ? 'assets/svg/box-open-prize.svg' : 'assets/svg/box-open-empty.svg';
  img.alt = '';
  nodes.push(img);
  nodes.push(el('div', 'outcome ' + (won ? 'win' : 'lose'), won ? L.win : L.lose));
  nodes.push(el('div', 'enum', L.enumerator_note));

  const btn = el('button', 'btn', L.next);
  const shown = Date.now();
  btn.addEventListener('click', () => {
    Engine.trial.explanation_screen_duration_ms = Date.now() - shown;
    Engine.commitTrial();
    const next = T.trial_index + 1;
    // Debrief screen removed during the trial phase: telling students that
    // switching wins would spread to their classmates and spoil the study.
    // To restore it later, call renderDebrief() here instead of renderComplete().
    if (next > CONFIG.TOTAL_TRIALS) renderComplete();
    else startTrial(next);
  });
  nodes.push(btn);
  screen(nodes);
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; }, CONFIG.LOCKOUT_MS);
}

/* =====================================================================
   EXPORT
   The debrief screen is deliberately not shown during the trial phase.
   renderDebrief() is kept below, unused, so it can be switched back on
   in one line once data collection is finished.
   ===================================================================== */
function renderDebrief() {
  const nodes = [];
  nodes.push(el('h1', 'center', L.debrief_title));
  nodes.push(el('p', null, L.debrief_body));
  const b = el('button', 'btn', L.next);
  b.addEventListener('click', renderComplete);
  nodes.push(b);
  screen(nodes);
}

function renderComplete() {
  const payload = Engine.buildExport();
  const pretty = JSON.stringify(payload, null, 2);
  const compact = JSON.stringify(payload);
  const m = payload.assessment_metadata;

  const nodes = [];
  nodes.push(el('h1', 'center', L.complete_title));
  nodes.push(el('p', 'center muted', L.complete_sub));
  nodes.push(el('p', 'center muted',
    'Chocolates won: ' + payload.aggregate_metrics.chocolates_earned + ' / ' + CONFIG.TOTAL_TRIALS));

  const safe = s => String(s).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 22);
  const fname = safe(m.school_name) + '_C' + m.class_level + '_' + safe(m.student_name) + '_' + m.session_id.slice(0, 8) + '.json';

  const dl = el('button', 'btn', L.download);
  dl.addEventListener('click', () => {
    const blob = new Blob([pretty], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  nodes.push(dl);

  const ta = el('textarea', 'export'); ta.value = compact; ta.readOnly = true;

  const cp = el('button', 'btn secondary', L.copy);
  cp.addEventListener('click', () => copyText(compact, ta, () => {
    cp.textContent = L.copied; setTimeout(() => cp.textContent = L.copy, 1500);
  }));
  nodes.push(cp);

  const form = el('button', 'btn', L.open_form);
  form.style.background = '#1E7A45';
  form.addEventListener('click', () => {
    // Copy first, then open — so the clipboard write is never lost.
    copyText(compact, ta, () => {
      window.open(CONFIG.GOOGLE_FORM_URL, '_blank', 'noopener');
    });
  });
  nodes.push(form);
  nodes.push(ta);

  const again = el('button', 'btn secondary', L.restart);
  again.addEventListener('click', renderImplementer);
  nodes.push(again);

  screen(nodes);
}

/* navigator.clipboard is unavailable on file:// in some browsers,
   so the textarea path is a real fallback, not a nicety. */
function copyText(text, ta, done) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(ta, done));
  } else legacyCopy(ta, done);
}
function legacyCopy(ta, done) {
  ta.removeAttribute('readonly');
  ta.focus(); ta.select(); ta.setSelectionRange(0, 999999);
  try { document.execCommand('copy'); } catch (e) {}
  ta.setAttribute('readonly', 'readonly');
  done();
}

document.addEventListener('DOMContentLoaded', renderImplementer);
