// 부트스트랩 & 메인 루프
const App = {
  started: false,
  onTitle: true,

  async boot() {
    Render.init($('#world'), $('#fx'));
    BGM.init();
    UI.init();
    await Promise.all([Sprites.loadSheets(), Sprites.loadOverrides(window.ASSET_MANIFEST), Sprites.loadChars(window.CHAR_MANIFEST), document.fonts ? document.fonts.ready : null]);
    if (Sprites.sheets.kenney) $('#coinIcon').append(Sprites.thumb('kenney', 'coin', 18));
    $('#musicBtn').addEventListener('click', () => this.syncMusic(BGM.toggle()));
    document.addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !e.target.closest('input')) this.syncMusic(BGM.toggle()); });
    this.syncMusic(!BGM.muted);
    window.addEventListener('resize', () => this.started && Render.resize($('#canvasWrap')));
    setInterval(() => { if (this.started && !Game.s.open) Game.save(); }, 20000);
    this.loadBackdrops();
    UI.showTitle();
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (this.started) {
        Game.update(dt);
        Render.draw(UI.state, dt);
      }
      BGM.set(BGM.scene(this.onTitle));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  // 마을 전경 그림 (assets/bg/town_clear.*, town_snow.*) — 있으면 타이틀과 장면 뒤에 깐다
  loadBackdrops() {
    this.backdrops = {};
    const tryLoad = (key, names) => {
      const [n, ...rest] = names; if (!n) return;
      const img = new Image();
      img.onload = () => { this.backdrops[key] = `url("${img.src}")`; this.syncBackdrop(); };
      img.onerror = () => tryLoad(key, rest);
      img.src = `assets/bg/${n}`;
    };
    tryLoad('clear', ['town_clear.webp', 'town_clear.png', 'town_clear.jpg']);
    tryLoad('snow', ['town_snow.webp', 'town_snow.png', 'town_snow.jpg']);
    setInterval(() => this.syncBackdrop(), 2000);
  },
  syncBackdrop() {
    const snowy = Game.s && (Game.s.weather === 'snow' || Game.hasEvent('blizzard'));
    const url = (snowy && this.backdrops.snow) || this.backdrops.clear || this.backdrops.snow || 'none';
    document.documentElement.style.setProperty('--backdrop', url);
  },

  start() {
    this.started = true; this.onTitle = false;
    Render.flakes = [];
    Render.resize($('#canvasWrap'));
    UI.setMode('utility');
    UI.syncSpeed();
  },

  syncMusic(on) { const b = $('#musicBtn'); b.textContent = on ? '♪' : '♪̸'; b.classList.toggle('off', !on); },
};

App.boot();
