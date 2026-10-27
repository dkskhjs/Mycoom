// BGM — NAPLE 저장소 assets/bgm 곡을 장면에 맞춰 크로스페이드로 재생
const BGM = {
  tracks: {
    title:    'the_map_unfolds',            // 타이틀
    prep:     'first_light_in_the_valley',  // 영업 전 준비/공사
    day:      'path_to_the_great_oak',      // 낮 영업
    evening:  'lanterns_in_the_canopy',     // 17시 이후 저녁 영업
    blizzard: 'under_permafrost',           // 눈보라
    crisis:   'halls_of_permafrost',        // 보일러 과압/파열
  },
  els: {},
  cur: null,
  pend: null,
  pendAt: 0,
  want: 'title',
  vol: 0.45,
  muted: false,
  unlocked: false,

  init() {
    try { this.muted = localStorage.getItem('steamcafe_mute') === '1'; } catch (e) {}
    const unlock = () => { this.unlocked = true; this.apply(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    setInterval(() => this.fadeStep(), 50);
  },

  el(key) {
    if (!this.els[key]) {
      const a = new Audio(`assets/naple/bgm/${this.tracks[key]}.mp3`);
      a.loop = true; a.volume = 0; a.preload = 'none';
      this.els[key] = a;
    }
    return this.els[key];
  },

  // 현재 장면에서 틀어야 할 곡
  scene(onTitle) {
    if (onTitle || !Game.s) return 'title';
    const s = Game.s;
    if (s.boiler.broken || Game.hasEvent('pressure')) return 'crisis';
    if (Game.hasEvent('blizzard')) return 'blizzard';
    if (!s.open) return 'prep';
    return s.min >= 17 * 60 ? 'evening' : 'day';
  },

  // 장면이 1.5초 이상 유지돼야 곡을 바꾼다 (이벤트가 깜빡여도 곡이 겹치지 않게)
  set(key) {
    if (key !== this.pend) { this.pend = key; this.pendAt = performance.now(); }
    if (this.want === key || performance.now() - this.pendAt < 1500 && this.cur) return;
    this.want = key;
    this.apply();
  },

  // iOS 사파리는 volume 이 읽기 전용 → 페이드 없이 바로 바꾼다
  volOK() {
    if (this._volOK === undefined) { const a = new Audio(); a.volume = 0.5; this._volOK = a.volume === 0.5; }
    return this._volOK;
  },

  apply() {
    if (!this.unlocked) return;
    if (this.muted) { for (const a of Object.values(this.els)) a.pause(); return; }
    if (!this.cur || !this.volOK()) this.startWant();
  },

  startWant() {
    for (const [k, a] of Object.entries(this.els)) if (k !== this.want && !a.paused) a.pause();
    this.cur = this.want;
    const a = this.el(this.cur);
    if (this.volOK()) a.volume = 0;
    if (a.paused) a.play().catch(() => {});
  },

  // 한 번에 한 곡만: 지금 곡을 끝까지 내려 멈춘 뒤 다음 곡을 올린다
  fadeStep() {
    if (!this.unlocked || this.muted || !this.cur) return;
    const a = this.el(this.cur);
    if (this.cur !== this.want) {
      a.volume = Math.max(0, a.volume - 0.04);
      if (a.volume <= 0.001 || a.paused) { a.pause(); this.startWant(); }
      return;
    }
    if (a.paused) a.play().catch(() => {});
    if (a.volume < this.vol) a.volume = Math.min(this.vol, a.volume + 0.02);
    for (const [k, b] of Object.entries(this.els)) if (k !== this.cur && !b.paused) b.pause();
  },

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('steamcafe_mute', this.muted ? '1' : '0'); } catch (e) {}
    if (!this.muted) this.unlocked = true;
    this.apply();
    return !this.muted;
  },
};
