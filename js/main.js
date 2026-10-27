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
