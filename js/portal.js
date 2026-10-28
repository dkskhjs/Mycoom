// 게임 포털 연동 (Poki / CrazyGames). 포털 빌드에서만 window.PORTAL 이 정해지고 해당 SDK 가 함께 실린다.
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
    } catch (e) { console.warn('포털 SDK 초기화 실패 — 광고 없이 계속', e); this.ready = false; }
  },
  // CrazyGames SDK 호출 (함수가 없거나 실패하면 false)
  cg(mod, fn, ...a) { try { const m = CrazyGames.SDK[mod]; if (m && typeof m[fn] === 'function') { m[fn](...a); return true; } } catch (e) {} return false; },

  loadingDone() {
    if (!this.ready) return;
    if (this.name === 'poki') PokiSDK.gameLoadingFinished();
    else this.cg('game', 'loadingStop');
  },
  // 실제로 조작·시간이 흐르는 동안만 true (메뉴·정산·광고 중에는 false)
  gameplay(on) {
    if (!this.ready || on === this.playing) return;
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
      else ok = await new Promise(res => { if (!this.cg('ad', 'requestAd', 'rewarded', { adStarted: () => this._pause(), adFinished: () => res(true), adError: () => res(false) })) res(false); });
    } catch (e) { ok = false; }
    this._resume();
    if (wasPlaying) this.gameplay(true);
    return ok;
  },
};
