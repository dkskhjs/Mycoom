// 효과음 + 마을 환경음 — 파일 없이 WebAudio 로 합성 (NAPLE 효과음은 쓰지 않음)
// · 가게 효과음: Game.sfx(name) → 'sfx' 이벤트. 가게를 가까이 볼수록 크게.
// · 증기 환경음: 마을 쪽으로 줌아웃할수록 커진다 (쉭쉭 새는 증기, 기관차 칙칙폭폭, 멀리 기적, 쇳소리).
const SFX = {
  ctx: null, out: null, sfxBus: null, ambBus: null, noise: null,
  vol: 0.55, envVol: 0.6,   // 효과음 / 증기·환경음 (설정 슬라이더)
  muted: false,
  last: {},

  init() {
    try {
      this.muted = localStorage.getItem('steamcafe_sfx_mute') === '1';
      const v = localStorage.getItem('steamcafe_vol_sfx'), e = localStorage.getItem('steamcafe_vol_env');
      if (v !== null) this.vol = +v; if (e !== null) this.envVol = +e;
    } catch (e) {}
    // iOS: 무음 스위치가 켜져 있어도 소리가 나게 (Safari 16.4+ 오디오 세션). 없으면 무시
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    // iOS 는 touchstart/pointerdown 이 아니라 touchend·click 에서만 오디오 잠금이 풀린다
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, true);
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; document.hidden ? this.ctx.suspend() : this.ctx.resume().catch(() => {}); });
    Game.on('sfx', n => this.play(n));
    Game.on('toast', (m, k) => { if (k === 'bad') this.play('error'); });
    // 버튼·탭·카드를 누를 때마다 기계 조작음 (맵 캔버스는 제외)
    document.addEventListener('click', e => {
      const el = e.target.closest && e.target.closest('button, .card, summary, [data-tab]');
      if (!el || el.disabled) return;
      this.unlock();
      if (el.matches('#tabs [data-tab], .subtabs button, #speed button')) this.play('uiTab');
      else if (el.matches('.card')) this.play('uiCard');
      else this.play('uiBtn');
    }, true);
    setInterval(() => this.ambTick(), 100);
  },

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.out = c.createGain(); this.out.gain.value = this.muted ? 0 : 1; this.out.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.vol; this.sfxBus.connect(this.out);
      this.ambBus = c.createGain(); this.ambBus.gain.value = 0; this.ambBus.connect(this.out);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.startAmbientBed();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // 옛 iOS: 제스처 안에서 소리를 한 번 재생해야 완전히 풀린다 (무음 1샘플)
    if (!this._primed) {
      try { const b = this.ctx.createBuffer(1, 1, 22050), src = this.ctx.createBufferSource(); src.buffer = b; src.connect(this.ctx.destination); src.start(0); this._primed = true; } catch (e) {}
    }
  },

  setVol(v) { this.vol = v; if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); try { localStorage.setItem('steamcafe_vol_sfx', v); } catch (e) {} },
  setEnvVol(v) { this.envVol = v; try { localStorage.setItem('steamcafe_vol_env', v); } catch (e) {} this.ambTick(); },
  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('steamcafe_sfx_mute', this.muted ? '1' : '0'); } catch (e) {}
    if (this.out) this.out.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    return !this.muted;
  },

  // ───────── 합성 부품 ─────────
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); },
  tone(f, t, dur, { type = 'sine', vol = 0.3, to = null, a = 0.005, bus = this.cur || this.sfxBus } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    this.env(g, t, a, vol, dur); o.connect(g).connect(bus);
    o.start(t); o.stop(t + a + dur + 0.05);
  },
  hiss(t, dur, { type = 'bandpass', f = 3000, q = 0.8, vol = 0.2, a = 0.02, to = null, bus = this.cur || this.sfxBus } = {}) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + a + dur);
    this.env(g, t, a, vol, dur); s.connect(fl).connect(g).connect(bus);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
  },
  bell(f, t, vol = 0.18, dur = 0.9) {   // 배음이 조화롭지 않은 종소리
    for (const [m, v] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) this.tone(f * m, t, dur / Math.sqrt(m), { vol: vol * v, a: 0.002 });
  },
  clank(t, f = 420, vol = 0.18) {        // 쇳소리
    for (const m of [1, 2.32, 3.87, 5.1]) this.tone(f * m, t, 0.18 / Math.sqrt(m) + 0.03, { type: 'triangle', vol: vol / m, a: 0.001 });
    this.hiss(t, 0.04, { f: 4000, q: 1, vol: vol * 0.6, a: 0.001 });
  },

  // 효과음 목록
  sounds: {
    cook_espresso(t) { this.clank(t, 600, 0.08); this.hiss(t + 0.05, 1.1, { f: 2600, q: 0.6, vol: 0.12, a: 0.15 }); for (let i = 0; i < 7; i++) this.tone(180 + Math.random() * 160, t + 0.35 + i * 0.09 + Math.random() * 0.04, 0.05, { type: 'sine', vol: 0.09, to: 380 }); },
    cook_kettle(t) { this.clank(t, 700, 0.06); this.hiss(t + 0.1, 1.2, { f: 1800, q: 1.5, vol: 0.08, a: 0.4, to: 3200 }); },
    cook_oven(t) { this.clank(t, 260, 0.16); this.clank(t + 0.14, 300, 0.1); this.hiss(t + 0.2, 0.6, { type: 'lowpass', f: 600, q: 0.5, vol: 0.12, a: 0.1 }); },
    ding(t) { this.bell(1568, t, 0.12, 0.8); },
    clink(t) { this.tone(2637, t, 0.12, { vol: 0.2 }); this.tone(3520, t + 0.06, 0.15, { vol: 0.15 }); },
    serve(t) { this.tone(2093, t, 0.08, { vol: 0.14 }); this.tone(1760, t + 0.04, 0.1, { vol: 0.12 }); },
    coin(t) { this.tone(988, t, 0.06, { type: 'square', vol: 0.11 }); this.tone(1319, t + 0.07, 0.28, { type: 'square', vol: 0.11 }); },
    coinTip(t) { this.sounds.coin.call(this, t); this.tone(1976, t + 0.16, 0.2, { type: 'triangle', vol: 0.14 }); this.tone(2637, t + 0.22, 0.25, { type: 'triangle', vol: 0.12 }); },
    buy(t) { this.hiss(t, 0.03, { f: 3000, vol: 0.12, a: 0.001 }); this.tone(1175, t + 0.02, 0.08, { type: 'square', vol: 0.04 }); this.bell(2349, t + 0.08, 0.06, 0.4); },
    coal(t) { for (let i = 0; i < 6; i++) this.hiss(t + i * 0.05 + Math.random() * 0.03, 0.06, { type: 'lowpass', f: 900, q: 1, vol: 0.16, a: 0.002 }); },
    bell(t) { this.bell(1760, t, 0.06, 0.6); this.bell(2217, t + 0.12, 0.05, 0.6); },
    place(t) { this.tone(160, t, 0.14, { vol: 0.22, to: 70 }); this.hiss(t, 0.05, { type: 'lowpass', f: 1200, vol: 0.1, a: 0.002 }); },
    heavy(t) { this.tone(110, t, 0.3, { vol: 0.3, to: 45 }); this.clank(t + 0.05, 220, 0.12); this.hiss(t + 0.1, 0.8, { f: 2500, vol: 0.08, a: 0.1 }); },
    pipe(t) { this.clank(t, 520, 0.14); this.clank(t + 0.09, 610, 0.08); },
    remove(t) { this.tone(140, t, 0.12, { vol: 0.15, to: 60 }); this.hiss(t, 0.15, { type: 'lowpass', f: 1500, vol: 0.12, a: 0.003 }); },
    brush(t) { this.hiss(t, 0.07, { f: 1800, q: 0.7, vol: 0.05, a: 0.01, to: 3000 }); },
    wipe(t) { this.hiss(t, 0.14, { f: 2000, q: 2, vol: 0.2, a: 0.02, to: 5000 }); this.hiss(t + 0.17, 0.14, { f: 4500, q: 2, vol: 0.18, a: 0.02, to: 2200 }); this.tone(3136, t + 0.3, 0.2, { vol: 0.04 }); },
    vent(t) { this.hiss(t, 1.3, { type: 'highpass', f: 1500, q: 0.5, vol: 0.22, a: 0.03 }); this.tone(1046, t, 0.5, { type: 'sawtooth', vol: 0.02, to: 900 }); },
    repair(t) { this.clank(t, 380, 0.14); this.clank(t + 0.18, 400, 0.12); this.clank(t + 0.36, 360, 0.14); },
    boom(t) { this.tone(80, t, 1.2, { vol: 0.4, to: 30 }); this.hiss(t, 1.4, { type: 'lowpass', f: 500, q: 0.7, vol: 0.4, a: 0.005, to: 120 }); this.hiss(t + 0.1, 2, { type: 'highpass', f: 2000, vol: 0.12, a: 0.1 }); },
    whistle(t) { this.steamWhistle(t, 1.2, 0.25, this.cur); },
    open(t) { this.bell(1319, t, 0.1, 0.9); this.bell(1760, t + 0.18, 0.09, 1); this.steamWhistle(t + 0.4, 0.6, 0.15, this.cur); },
    close(t) { this.bell(1319, t, 0.08, 1); this.bell(988, t + 0.25, 0.08, 1.2); },
    levelup(t) { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.09, 0.25, { type: 'triangle', vol: 0.13 })); this.bell(2093, t + 0.4, 0.06, 0.9); },
    // 실내 증기 (가끔): 보일러·배관에서 나는 소리
    in_hiss(t) { this.hiss(t, 1.2 + Math.random() * 1.2, { type: 'highpass', f: 2200 + Math.random() * 1200, q: 0.5, vol: 0.07, a: 0.35 }); },
    in_puff(t) { this.hiss(t, 0.35, { f: 1500, q: 0.7, vol: 0.12, a: 0.01, to: 3500 }); this.tone(90, t, 0.18, { vol: 0.08, to: 50 }); },
    in_knock(t) { const n = 2 + Math.floor(Math.random() * 3), f = 170 + Math.random() * 90; for (let i = 0; i < n; i++) this.clank(t + i * (0.14 + Math.random() * 0.12), f, 0.06 - i * 0.008); },
    in_tick(t) { for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) this.tone(1400 + Math.random() * 600, t + i * (0.18 + Math.random() * 0.25), 0.025, { type: 'square', vol: 0.05 }); },
    in_chuff(t) { for (let i = 0; i < 3; i++) { this.hiss(t + i * 0.42, 0.22, { f: 800 + i * 150, q: 0.6, vol: 0.09, a: 0.02 }); this.tone(65, t + i * 0.42, 0.15, { vol: 0.08 }); } },
    in_whistle(t) { this.steamWhistle(t, 0.5, 0.18, this.cur); },
    // UI 조작음: 묵직한 기계 스위치·레버·톱니
    uiBtn(t) {   // 황동 스위치 딸깍-쿵
      this.hiss(t, 0.018, { f: 2400, q: 1.2, vol: 0.32, a: 0.001 });
      this.tone(150, t, 0.11, { vol: 0.32, to: 55 });
      this.tone(620, t + 0.004, 0.05, { type: 'triangle', vol: 0.06, to: 380 });
      this.hiss(t + 0.03, 0.05, { type: 'lowpass', f: 700, q: 0.8, vol: 0.14, a: 0.002 });
    },
    uiTab(t) {   // 레버 당기는 철컥-쿵
      this.hiss(t, 0.02, { f: 1800, q: 1.4, vol: 0.28, a: 0.001 });
      this.hiss(t + 0.07, 0.025, { f: 2600, q: 1.4, vol: 0.3, a: 0.001 });
      this.tone(120, t + 0.07, 0.16, { vol: 0.38, to: 42 });
      this.clank(t + 0.07, 310, 0.07);
    },
    uiCard(t) {  // 톱니 걸리는 틱
      this.hiss(t, 0.012, { f: 3200, q: 2, vol: 0.22, a: 0.001 });
      this.tone(190, t, 0.07, { vol: 0.22, to: 80 });
      this.tone(880, t + 0.002, 0.03, { type: 'square', vol: 0.03, to: 500 });
    },
    error(t) { this.tone(150, t, 0.1, { type: 'square', vol: 0.08 }); this.tone(120, t + 0.12, 0.14, { type: 'square', vol: 0.08 }); },
  },
  // 같은 소리가 너무 촘촘하면 거른다 (자동 운영·빠른 배속·드래그)
  mix: { uiBtn: 0.6, uiTab: 0.6, uiCard: 0.65 },   // 조작음은 게임 소리보다 한 단계 아래
  gap: { uiBtn: 0.06, uiTab: 0.08, uiCard: 0.05, brush: 0.07, coin: 0.09, coinTip: 0.09, bell: 0.8, pipe: 0.12, remove: 0.1, error: 0.4, ding: 0.15, clink: 0.1, serve: 0.15, place: 0.1 },

  play(name) {
    if (!this.ctx || this.muted) return;
    const fn = this.sounds[name]; if (!fn) return;
    // 아직 잠금이 풀리는 중(suspended/interrupted)이면 풀린 뒤에 재생
    if (this.ctx.state !== 'running') { if (!this._retry) { this._retry = true; this.ctx.resume().then(() => { this._retry = false; if (this.ctx.state === 'running') this.play(name); }).catch(() => { this._retry = false; }); } return; }
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || -9) < (this.gap[name] ?? 0.05)) return;
    this.last[name] = now;
    // 마을 쪽으로 멀어질수록 가게 안 소리는 작게 (UI 반응음은 그대로)
    const ui = ['uiBtn', 'uiTab', 'uiCard', 'error', 'buy', 'coal', 'levelup', 'place', 'heavy', 'pipe', 'remove', 'brush'].includes(name);
    const near = typeof Render !== 'undefined' && Render.focus != null ? Render.focus : 1;
    const g = this.cur = this.ctx.createGain();
    // 실내 증기 소리는 효과음이 아니라 환경음 슬라이더를 따른다 (기본값에서 예전의 약 1.8배)
    const env = name.startsWith('in_');
    g.gain.value = (ui ? 1 : 0.25 + 0.75 * near) * (this.mix[name] ?? 1) * (env ? this.envVol * 1.65 / Math.max(0.05, this.vol) : 1);
    g.connect(this.sfxBus);
    try { fn.call(this, now + 0.01); } catch (e) {}
    this.cur = null;
    setTimeout(() => g.disconnect(), 4000);
  },

  // ───────── 증기 환경음 ─────────
  steamWhistle(t, dur, vol, bus) {     // 화음 두 개 + 숨소리 = 기적
    for (const f of [466, 587, 698]) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lf = c.createOscillator(), lg = c.createGain(), bp = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.15);
      lf.frequency.value = 5.5; lg.gain.value = f * 0.006; lf.connect(lg).connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol / 3, t + 0.12); g.gain.setValueAtTime(vol / 3, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
      o.connect(bp).connect(g).connect(bus); o.start(t); lf.start(t); o.stop(t + dur + 0.5); lf.stop(t + dur + 0.5);
    }
    this.hiss(t, dur + 0.3, { f: 2200, q: 1, vol: vol * 0.5, a: 0.1, bus });
  },
  // 깔려 있는 소리: 낮은 기계 웅웅거림 + 일렁이는 증기 쉭 소리
  startAmbientBed() {
    const c = this.ctx, mk = (type, f, q, v) => {
      const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = v;
      s.connect(fl).connect(g).connect(this.ambBus); s.start(); return g;
    };
    mk('lowpass', 140, 0.7, 0.5);                       // 공장 웅웅
    const hissG = mk('bandpass', 3500, 0.5, 0.05);      // 새는 증기
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.13; lg.gain.value = 0.04; lfo.connect(lg).connect(hissG.gain); lfo.start();
    const hum = c.createOscillator(), hg = c.createGain();
    hum.type = 'triangle'; hum.frequency.value = 55; hg.gain.value = 0.03; hum.connect(hg).connect(this.ambBus); hum.start();
    this.nextAmb = c.currentTime + 1.5;
  },
  ambLevel() {
    if (typeof App === 'undefined' || !App.started || !Game.s) return 0;
    const far = 1 - (Render.focus ?? 1);
    return this.envVol * 0.85 * (0.06 + 0.94 * far);   // 가게 안에서는 아주 작게, 마을 전체면 최대
  },
  // 가게 안: 보일러가 돌 때 가끔 증기·배관 소리 (압력이 높으면 더 자주)
  indoorTick() {
    if (this.muted || typeof App === 'undefined' || !App.started || !Game.s) return;
    const c = this.ctx, now = c.currentTime;
    if (this.nextIndoor === undefined) this.nextIndoor = now + 4 + Math.random() * 6;
    if (now < this.nextIndoor) return;
    const near = Render.focus ?? 1, b = Game.s.boiler, running = Game.s.objects.some(o => o.id === 'boiler') && Game.boilerRunning();
    const pressure = b ? b.pressure : 0;
    this.nextIndoor = now + (pressure > 70 ? 4 : 8) + Math.random() * (pressure > 70 ? 5 : 12);
    if (!running || near < 0.35 || Game.paused) return;
    const pool = ['in_hiss', 'in_hiss', 'in_puff', 'in_knock', 'in_tick', 'in_chuff'];
    if (pressure > 70) pool.push('in_puff', 'in_whistle');
    if (Game.s.pipe.heat.some(Boolean)) pool.push('in_tick', 'in_knock');
    this.play(pool[Math.floor(Math.random() * pool.length)]);
  },
  ambTick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, lv = this.muted ? 0 : this.ambLevel();
    this.ambBus.gain.setTargetAtTime(lv, c.currentTime, 0.4);
    this.indoorTick();
    if (lv < 0.05 || c.currentTime < this.nextAmb) return;
    // 가끔 들리는 마을 소리
    const t = c.currentTime + 0.05, r = Math.random(), bus = this.ambBus;
    if (r < 0.3) {                         // 증기기관 칙칙폭폭 (가까워졌다 멀어짐)
      const n = 10 + Math.floor(Math.random() * 8), gap = 0.32 + Math.random() * 0.12;
      for (let i = 0; i < n; i++) { const k = Math.sin(Math.PI * (i + 0.5) / n); this.hiss(t + i * gap, 0.16, { f: 900 + Math.random() * 300, q: 0.6, vol: 0.2 * k, a: 0.01, bus }); if (i % 2 === 0) this.tone(70, t + i * gap, 0.12, { vol: 0.12 * k, bus }); }
      this.nextAmb = t + n * gap + 1 + Math.random() * 3;
    } else if (r < 0.5) {                  // 멀리 기적
      this.steamWhistle(t, 0.8 + Math.random() * 1.2, 0.35, bus);
      this.nextAmb = t + 3 + Math.random() * 4;
    } else if (r < 0.78) {                 // 압력 밸브가 푸슉
      this.hiss(t, 0.6 + Math.random() * 0.9, { type: 'highpass', f: 1800 + Math.random() * 1500, q: 0.5, vol: 0.18, a: 0.02, bus });
      this.nextAmb = t + 1.5 + Math.random() * 3;
    } else {                               // 공장 쇳소리 / 망치
      const n = 1 + Math.floor(Math.random() * 3), f = 200 + Math.random() * 300;
      for (let i = 0; i < n; i++) { this.tone(f, t + i * 0.45, 0.25, { type: 'triangle', vol: 0.1, bus }); this.tone(f * 2.7, t + i * 0.45, 0.12, { vol: 0.05, bus }); }
      this.nextAmb = t + 1.5 + Math.random() * 3;
    }
  },
};
