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

  set(key) {
    if (this.want === key) return;
    this.want = key;
    this.apply();
  },

  apply() {
    if (!this.unlocked || this.muted) return;
    const a = this.el(this.want);
    if (a.paused) a.play().catch(() => {});
    this.cur = this.want;
  },

  // 원하는 곡은 올리고 나머지는 내린다 (내려간 곡은 일시정지 — 다시 오면 이어서 재생)
  fadeStep() {
    for (const [k, a] of Object.entries(this.els)) {
      const target = (!this.muted && k === this.want) ? this.vol : 0;
      const v = a.volume + Math.sign(target - a.volume) * 0.025;
      a.volume = Math.max(0, Math.min(1, Math.abs(target - a.volume) < 0.03 ? target : v));
      if (a.volume === 0 && !a.paused && k !== this.want) a.pause();
    }
  },

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('steamcafe_mute', this.muted ? '1' : '0'); } catch (e) {}
    if (!this.muted) { this.unlocked = true; this.apply(); }
    return !this.muted;
  },
};
