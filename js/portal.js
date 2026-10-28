// 게임 포털 연동 (Poki / CrazyGames / GameDistribution / Newgrounds). 포털 빌드에서만 window.PORTAL 이 정해지고 해당 SDK 가 함께 실린다.
// Newgrounds 는 광고 SDK 가 없다 (사이트가 게임 둘레에 광고를 붙임) → 외부 요청만 막고 신호는 보내지 않는다.
// 일반 배포(GitHub Pages)에서는 모든 호출이 아무 일도 하지 않는다.
// - 로딩 끝: loadingDone()      - 플레이 중/멈춤: gameplay(true|false)
// - 쉬는 지점 광고: commercialBreak()  (다음 날로 넘어갈 때)
// - 보상형 광고: rewardedBreak() → 끝까지 봤으면 true
const Portal = {
  name: window.PORTAL || null,
  ready: false,
  playing: false,
  get hasAds() { return this.ready && !!this.name; },

  async init() {
    try {
      if (this.name === 'poki' && window.PokiSDK) { await PokiSDK.init(); this.ready = true; }
      else if (this.name === 'crazygames' && window.CrazyGames && CrazyGames.SDK) {
        await CrazyGames.SDK.init();
        this.ready = true;
        this.cg('game', 'loadingStart');
      }
      else if (this.name === 'gamedistribution') {
        // GD_OPTIONS.onEvent 가 SDK_READY 를 알려 준다 (index.html 에서 Portal.gdEvent 로 넘김). 5초 안에 안 오면 광고 없이 시작
        (window.__gdq || []).splice(0).forEach(ev => this.gdEvent(ev));   // Portal 이 실리기 전에 온 이벤트
        this.ready = this._gdOk ?? await new Promise(res => { this._gdReady = res; setTimeout(() => res(false), 5000); });
        if (this.ready) try { Promise.resolve(gdsdk.preloadAd('rewarded')).catch(() => {}); } catch (e) {}
      }
    } catch (e) { console.warn('포털 SDK 초기화 실패 — 광고 없이 계속', e); this.ready = false; }
  },
  // CrazyGames SDK 호출 (함수가 없거나 실패하면 false)
  cg(mod, fn, ...a) { try { const m = CrazyGames.SDK[mod]; if (m && typeof m[fn] === 'function') { m[fn](...a); return true; } } catch (e) {} return false; },

  // GameDistribution SDK 이벤트
  gdEvent(ev) {
    const n = ev && ev.name;
    if (n === 'SDK_READY' || n === 'SDK_ERROR') { this._gdOk = n === 'SDK_READY'; this._gdReady && this._gdReady(this._gdOk); }
    else if (n === 'SDK_GAME_PAUSE') { if (!this._was) this._pause(); }
    else if (n === 'SDK_GAME_START') this._resume();
    else if (n === 'SDK_REWARDED_WATCH_COMPLETE') this._rewarded = true;
  },
  // GameDistribution 은 시작 버튼에서 첫 광고(pre-roll)를 요구한다 → 게임 시작 때 한 번
  preroll() {
    if (this.name !== 'gamedistribution' || this._prerolled) return;
    this._prerolled = true;
    return this.commercialBreak();
  },

  loadingDone() {
    if (!this.ready) return;
    if (this.name === 'poki') PokiSDK.gameLoadingFinished();
    else if (this.name === 'crazygames') this.cg('game', 'loadingStop');
  },
  // 실제로 조작·시간이 흐르는 동안만 true (메뉴·정산·광고 중에는 false)
  gameplay(on) {
    if (!this.ready || on === this.playing) return;
    if (this.name === 'gamedistribution') { this.playing = on; return; }   // GD 는 플레이 신호가 없다
    this.playing = on;
    if (this.name === 'poki') on ? PokiSDK.gameplayStart() : PokiSDK.gameplayStop();
    else this.cg('game', on ? 'gameplayStart' : 'gameplayStop');
  },

  // 광고 동안 소리와 게임을 멈춘다
  _pause() {
    this._was = { bgm: BGM.muted, sfx: SFX.muted, paused: Game.paused };
    BGM.muted = true; BGM.apply();
    SFX.muted = true; if (SFX.out) SFX.out.gain.value = 0;
    Game.paused = true;
  },
  _resume() {
    const w = this._was; if (!w) return; this._was = null;
    BGM.muted = w.bgm; BGM.apply();
    SFX.muted = w.sfx; if (SFX.out) SFX.out.gain.value = w.sfx ? 0 : 1;
    Game.paused = w.paused;
    if (typeof UI !== 'undefined') UI.syncSpeed();
  },

  async commercialBreak() {
    if (!this.hasAds) return;
    const wasPlaying = this.playing; this.gameplay(false);
    try {
      if (this.name === 'poki') await PokiSDK.commercialBreak(() => this._pause());
      else if (this.name === 'gamedistribution') await Promise.resolve(gdsdk.showAd()).catch(() => {});
      else await new Promise(res => { if (!this.cg('ad', 'requestAd', 'midgame', { adStarted: () => this._pause(), adFinished: res, adError: res })) res(); });
    } catch (e) {}
    this._resume();
    if (wasPlaying) this.gameplay(true);
  },

  async rewardedBreak() {
    if (!this.hasAds) return false;
    const wasPlaying = this.playing; this.gameplay(false);
    let ok = false;
    try {
      if (this.name === 'poki') ok = !!(await PokiSDK.rewardedBreak(() => this._pause()));
      else if (this.name === 'gamedistribution') {
        this._rewarded = false;
        await Promise.resolve(gdsdk.showAd('rewarded')).catch(() => {});
        ok = this._rewarded;
        try { Promise.resolve(gdsdk.preloadAd('rewarded')).catch(() => {}); } catch (e) {}
      }
      else ok = await new Promise(res => { if (!this.cg('ad', 'requestAd', 'rewarded', { adStarted: () => this._pause(), adFinished: () => res(true), adError: () => res(false) })) res(false); });
    } catch (e) { ok = false; }
    this._resume();
    if (wasPlaying) this.gameplay(true);
    return ok;
  },
};
