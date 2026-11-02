/* =====================================================================
   engine.js — THE MODEL. No DOM access anywhere in this file.
   All randomisation, host logic and telemetry live here.
   ===================================================================== */

const CONFIG = {
  TOTAL_TRIALS: 12,
  BOX_COUNT: 3,
  LOCKOUT_MS: 1200,
  RAPID_DECISION_MS: 1000,
  GOOGLE_FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSdJMdLkusGetXzQrv7kwr7pPGXDDAYW202TIxND_QJQiJbTaA/viewform?usp=header'
};

/* ---------------------------------------------------------------------
   BLOCK PLAN — fixed order for every student (no counterbalancing).
     1-3   NORMAL_PRE    plain boxes
     4-6   COLOUR        red / green / blue, positions permuted each trial
     7-9   AUTHORITY     implementer photo + fixed recommendation to KEEP
    10-12  NORMAL_POST   plain boxes, compared against NORMAL_PRE
   --------------------------------------------------------------------- */
function blockFor(n) {
  if (n <= 3) return 'NORMAL_PRE';
  if (n <= 6) return 'COLOUR';
  if (n <= 9) return 'AUTHORITY';
  return 'NORMAL_POST';
}

const COLOURS = ['RED', 'GREEN', 'BLUE'];

const Engine = {
  session: null,
  trial: null,
  trials: [],
  assertionFailures: [],

  startSession(meta) {
    this.session = {
      session_id: uuidv4(),
      instrument_version: 'v2.0',
      implementer_name: meta.implementer_name,
      implementer_is_custom: !!meta.implementer_is_custom,
      student_name: meta.student_name,
      school_name: meta.school_name,
      class_level: meta.class_level,
      gender: meta.gender,
      language_selected: meta.language,
      timestamp_started: Date.now()
    };
    this.trials = [];
    this.assertionFailures = [];
    return this.session;
  },

  buildTrial(n) {
    const block = blockFor(n);
    const t = {
      trial_index: n,
      block: block,
      box_count: CONFIG.BOX_COUNT,
      host_type: 'GENUINE',

      // Prize position is drawn fresh every trial and is never exposed to
      // the interface before the final reveal. No fixed-position pattern.
      prize_index: Math.floor(Math.random() * CONFIG.BOX_COUNT),

      colour_map: block === 'COLOUR' ? shuffle(COLOURS.slice()) : null,
      authority_shown: block === 'AUTHORITY',

      initial_choice: null,
      initial_colour: null,
      time_start: null,
      thinking_time: null,

      opened_index: null,
      alternative_index: null,

      final_choice: null,
      final_colour: null,
      eval_time_start: null,
      evaluation_time: null,
      is_switch: null,
      is_unusually_rapid_decision: false,

      alternative_side: null,      // side the OTHER box sat on (logged every trial)
      switch_direction: null,      // side moved to, only when the student switched
      authority_compliant: null,   // true = kept, i.e. followed the advice

      trial_outcome: null,
      switch_was_optimal: null,    // was switching the winning move this trial?
      chose_optimally: null,       // did the student make the winning move?
      explanation_screen_duration_ms: null,
      narrative: null              // plain-English record of what happened
    };
    this.trial = t;
    return t;
  },

  recordInitialChoice(index) {
    const t = this.trial;
    t.initial_choice = index;
    t.thinking_time = Date.now() - t.time_start;
    if (t.colour_map) t.initial_colour = t.colour_map[index];
  },

  /* ---------- GENUINE HOST ----------
     Opens a box that is neither the student's pick nor the chocolate.
     "Random" applies only to the tie-break when the student happened to
     pick the chocolate and both remaining boxes are empty.            */
  executeHostReveal() {
    const t = this.trial;
    const candidates = [];
    for (let i = 0; i < t.box_count; i++) {
      if (i !== t.initial_choice && i !== t.prize_index) candidates.push(i);
    }
    t.opened_index = candidates[Math.floor(Math.random() * candidates.length)];

    for (let i = 0; i < t.box_count; i++) {
      if (i !== t.initial_choice && i !== t.opened_index) { t.alternative_index = i; break; }
    }

    this._assertIntegrity(t);
    return { opened: t.opened_index, alternative: t.alternative_index };
  },

  _assertIntegrity(t) {
    const bad = [];
    if (t.opened_index === t.initial_choice) bad.push('opened the student\'s own box');
    if (t.opened_index === t.prize_index) bad.push('opened the chocolate');
    if (t.alternative_index === null) bad.push('no alternative box found');
    if (t.alternative_index === t.initial_choice) bad.push('alternative equals initial choice');
    if (t.alternative_index === t.opened_index) bad.push('alternative equals opened box');
    if (bad.length) {
      const rec = { trial_index: t.trial_index, problems: bad, snapshot: JSON.parse(JSON.stringify(t)) };
      this.assertionFailures.push(rec);
      console.error('HOST INTEGRITY FAILURE', rec);
    }
  },

  /* ---------- final decision is a direct box tap, not a button ---------- */
  recordFinalChoice(index) {
    const t = this.trial;
    t.final_choice = index;
    t.evaluation_time = Date.now() - t.eval_time_start;
    t.is_switch = index !== t.initial_choice;
    t.is_unusually_rapid_decision = t.evaluation_time < CONFIG.RAPID_DECISION_MS;
    if (t.colour_map) t.final_colour = t.colour_map[index];
    t.alternative_side = t.alternative_index < t.initial_choice ? 'LEFT' : 'RIGHT';
    t.switch_direction = t.is_switch ? t.alternative_side : null;
    if (t.authority_shown) t.authority_compliant = (t.is_switch === false);
    t.trial_outcome = index === t.prize_index ? 'WIN' : 'LOSE';

    // Switching wins exactly when the first pick was not the chocolate.
    t.switch_was_optimal = (t.initial_choice !== t.prize_index);
    t.chose_optimally = (t.is_switch === t.switch_was_optimal);
    t.narrative = buildNarrative(t);
  },

  commitTrial() {
    this.trials.push(JSON.parse(JSON.stringify(this.trial)));
  },

  buildExport() {
    const T = this.trials;
    const rate = (n, d) => d ? +(n / d).toFixed(3) : null;
    const swOf = arr => rate(arr.filter(x => x.is_switch).length, arr.length);
    const mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : null;
    const blk = b => T.filter(x => x.block === b);

    const pre = blk('NORMAL_PRE'), post = blk('NORMAL_POST');
    const col = blk('COLOUR'), auth = blk('AUTHORITY');
    const swPre = swOf(pre), swPost = swOf(post);

    const colourPicks = { RED: 0, GREEN: 0, BLUE: 0 };
    const colourFirstPicks = { RED: 0, GREEN: 0, BLUE: 0 };
    col.forEach(x => {
      if (x.final_colour) colourPicks[x.final_colour]++;
      if (x.initial_colour) colourFirstPicks[x.initial_colour]++;
    });

    const switched = T.filter(x => x.is_switch === true);
    const kept = T.filter(x => x.is_switch === false);
    const wins = T.filter(x => x.trial_outcome === 'WIN');

    return {
      assessment_metadata: Object.assign({}, this.session, { timestamp_completed: Date.now() }),
      aggregate_metrics: {
        total_trials: T.length,
        correct_responses: wins.length,
        total_wins: wins.length,
        chocolates_earned: wins.length,
        accuracy_rate: rate(wins.length, T.length),
        times_switched: switched.length,
        times_kept: kept.length,
        win_rate_when_switched: rate(switched.filter(x => x.trial_outcome === 'WIN').length, switched.length),
        win_rate_when_kept: rate(kept.filter(x => x.trial_outcome === 'WIN').length, kept.length),
        optimal_choice_rate: rate(T.filter(x => x.chose_optimally === true).length, T.length),
        overall_switch_rate: swOf(T),
        switch_rate_normal_pre: swPre,
        switch_rate_colour: swOf(col),
        switch_rate_authority: swOf(auth),
        switch_rate_normal_post: swPost,
        learning_shift: (swPre !== null && swPost !== null) ? +(swPost - swPre).toFixed(3) : null,
        authority_compliance_rate: rate(auth.filter(x => x.authority_compliant === true).length, auth.length),
        colour_final_picks: colourPicks,
        colour_first_picks: colourFirstPicks,
        avg_thinking_time_ms: mean(T.map(x => x.thinking_time).filter(v => v != null)),
        avg_evaluation_time_ms: mean(T.map(x => x.evaluation_time).filter(v => v != null)),
        rapid_decision_count: T.filter(x => x.is_unusually_rapid_decision).length,
        switch_direction_left: switched.filter(x => x.switch_direction === 'LEFT').length,
        switch_direction_right: switched.filter(x => x.switch_direction === 'RIGHT').length,
        total_time_ms: T.reduce((a, x) => a + (x.thinking_time || 0) + (x.evaluation_time || 0), 0)
      },
      integrity: {
        assertion_failures: this.assertionFailures.length,
        assertion_details: this.assertionFailures
      },
      detailed_trials: T
    };
  }
};

/* Plain-English record of the trial, so a reader can reconstruct exactly
   what happened without decoding index numbers. */
function buildNarrative(t) {
  const b = n => 'Box ' + (n + 1);
  const col = i => t.colour_map ? ' (' + t.colour_map[i].toLowerCase() + ')' : '';
  let s = 'Block ' + t.block + '. Chocolate was in ' + b(t.prize_index) + '. ';
  s += 'Student first picked ' + b(t.initial_choice) + col(t.initial_choice) + '. ';
  s += 'Computer opened empty ' + b(t.opened_index) + col(t.opened_index) + '. ';
  s += 'Remaining: ' + b(t.initial_choice) + ' and ' + b(t.alternative_index) + col(t.alternative_index) + '. ';
  if (t.authority_shown) s += 'Authority figure advised keeping the first box. ';
  s += 'Student ' + (t.is_switch ? 'switched to ' + b(t.final_choice) : 'kept ' + b(t.final_choice)) + '. ';
  s += 'Switching would have ' + (t.switch_was_optimal ? 'won' : 'lost') + ' this trial. ';
  s += 'Result: ' + t.trial_outcome + '.';
  return s;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function uuidv4() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
