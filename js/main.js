// 부트스트랩 & 메인 루프
const App = {
  started: false,
  onTitle: true,

  async boot() {
    Render.init($('#world'), $('#fx'));
    BGM.init();
    SFX.init();
    UI.init();
    await Promise.all([
      Sprites.loadSheets(), 
      Sprites.loadOverrides(window.ASSET_MANIFEST), 
      Sprites.loadChars(window.CHAR_MANIFEST), 
      document.fonts ? document.fonts.ready : null
    ]);
    if (Sprites.sheets.kenney) $('#coinIcon').append(Sprites.thumb('kenney', 'coin', 18));
    $('#musicBtn').addEventListener('click', () => this.syncMusic(BGM.toggle()));
    document.addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !e.target.closest('input')) this.syncMusic(BGM.toggle()); });
    this.syncMusic(!BGM.muted);
    window.addEventListener('resize', () => this.started && Render.resize($('#canvasWrap')));
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => setTimeout(() => this.started && Render.resize($('#canvasWrap')), 60));
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

  // ───────── 전체화면 ─────────
  // 안드로이드 크롬 등은 Fullscreen API, 아이폰 사파리는 미지원 → 홈 화면에 추가(PWA)하면 전체화면으로 열림
  isMobile() { return matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); },
  isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  isStandalone() { return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true; },
  canFullscreen() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen) && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true); },
  isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  enterFullscreen() {
    if (this.isFullscreen() || this.isStandalone() || !this.canFullscreen()) return;
    const d = document.documentElement, req = d.requestFullscreen || d.webkitRequestFullscreen;
    try { const r = req.call(d, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  },
  exitFullscreen() { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f && this.isFullscreen()) { const r = f.call(document); if (r && r.catch) r.catch(() => {}); } },
  toggleFullscreen() { this.isFullscreen() ? this.exitFullscreen() : this.enterFullscreen(); },
  // 모바일에서 게임 시작 버튼을 누를 때 자동으로 (사용자 터치가 있어야 허용됨)
  autoFullscreen() { if (this.isMobile()) this.enterFullscreen(); },

  syncMusic(on) { const b = $('#musicBtn'); b.textContent = on ? '♪' : '♪̸'; b.classList.toggle('off', !on); },
};

App.boot();
