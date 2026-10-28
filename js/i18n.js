// 한/영 전환. 게임 코드는 한국어 문자열을 그대로 쓰고, 영어일 때 화면에 나가는 글자를 I18N_EN 사전으로 바꾼다.
// - DOM: MutationObserver 가 새로 들어오거나 바뀐 글자(텍스트·title·placeholder)를 바꾼다
// - 캔버스 글자(떠오르는 숫자 등)·튜토리얼은 I18N.t() 를 직접 부른다
// 바꾸는 순서: ① 사전에 그대로 있음 ② 템플릿(`…${x}…` → {0}) 모양과 맞음 — 끼워진 값도 다시 번역 ③ 아는 조각을 찾아 바꿈
const I18N = {
  KEY: 'steamcafe_lang',
  HAN: /[가-힣]/,
  lang: (() => {
    try { const l = localStorage.getItem('steamcafe_lang'); if (l === 'ko' || l === 'en') return l; } catch (e) {}
    return /^ko\b/i.test(navigator.language || '') ? 'ko' : 'en';
  })(),
  get en() { return this.lang === 'en'; },
  cache: new Map(),

  set(lang) {
    if (lang === this.lang) return;
    try { localStorage.setItem(this.KEY, lang); } catch (e) {}
    try { if (typeof Game !== 'undefined' && Game.s && !App.onTitle) Game.save(); } catch (e) {}
    location.reload();
  },

  // 템플릿 사전 → 정규식 (글자가 많은 것부터 = 더 구체적인 것부터)
  _compile() {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    this.pats = []; this.dict = {};
    const pieces = [];
    for (let [ko, en] of Object.entries(I18N_EN)) {
      ko = ko.trim(); en = en.trim(); this.dict[ko] = en;
      if (!/\{\d\}/.test(ko)) { if (ko) pieces.push(ko); continue; }
      const lits = ko.split(/\{\d\}/), order = (ko.match(/\{\d\}/g) || []).map(p => +p[1]);
      // 자리표시가 붙어 있으면({3}{4}) 앞쪽은 공백 전까지(숫자 등)만 잡는다
      const re = new RegExp('^' + lits.map((l, i) => (i ? (lits[i] === '' && i < lits.length - 1 ? '(\\S*)' : '([\\s\\S]*?)') : '') + esc(l)).join('') + '$');
      const need = lits.reduce((a, b) => b.length > a.length ? b : a, '');
      this.pats.push({ re, en, order, need, w: lits.join('').length });
    }
    this.pats.sort((a, b) => b.w - a.w);
    pieces.sort((a, b) => b.length - a.length);
    this.pieceRe = pieces.length ? new RegExp(pieces.map(esc).join('|'), 'g') : null;
  },

  t(s, depth = 0) {
    if (this.lang !== 'en' || typeof s !== 'string' || !this.HAN.test(s)) return s;
    const hit = this.cache.get(s); if (hit !== undefined) return hit;
    let r = this._t(s, depth);
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(s, r);
    return r;
  },
  _t(s, depth) {
    const lead = s.match(/^\s*/)[0], tail = s.slice(lead.length).match(/\s*$/)[0], core = s.slice(lead.length, s.length - tail.length);
    if (!this.pats) this._compile();
    if (this.dict[core] !== undefined) return lead + this.dict[core] + tail;
    let best = null, bestN = Infinity;
    if (depth < 4) for (const p of this.pats) {
      if (p.need && !core.includes(p.need)) continue;
      const m = p.re.exec(core); if (!m) continue;
      const vals = m.slice(1).map(v => this.t(v, depth + 1));
      const out = p.en.replace(/\{(\d)\}/g, (_, i) => vals[p.order.indexOf(+i)] ?? '');
      const n = (out.match(/[가-힣]/g) || []).length;
      if (!n) return lead + out + tail;
      if (n < bestN) { best = out; bestN = n; }
    }
    let out = best ?? core;
    // ' · ' 로 이어 붙인 글은 조각마다 번역
    if (this.HAN.test(out) && depth < 4 && out.includes(' · ')) {
      const seg = out.split(' · ').map(x => this.t(x, depth + 1)).join(' · ');
      if ((seg.match(/[가-힣]/g) || []).length < (out.match(/[가-힣]/g) || []).length) out = seg;
    }
    if (this.pieceRe && this.HAN.test(out)) out = out.replace(this.pieceRe, k => this.dict[k]);
    return lead + out + tail;
  },

  // DOM 번역
  ATTRS: ['title', 'placeholder', 'aria-label'],
  node(n) {
    if (n.nodeType === 3) { const v = n.data; if (this.HAN.test(v)) { const r = this.t(v); if (r !== v) n.data = r; } return; }
    if (n.nodeType !== 1) return;
    if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
    this.attrs(n);
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let c = w.nextNode(); c; c = w.nextNode()) {
      if (c.nodeType === 3) { const v = c.data; if (this.HAN.test(v)) { const r = this.t(v); if (r !== v) c.data = r; } }
      else this.attrs(c);
    }
  },
  attrs(el) {
    for (const a of this.ATTRS) { const v = el.getAttribute(a); if (v && this.HAN.test(v)) el.setAttribute(a, this.t(v)); }
  },
  start() {
    document.documentElement.lang = this.lang;
    if (this.lang !== 'en') return;
    document.title = this.t(document.title);
    this.node(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') this.node(m.target);
        else if (m.type === 'attributes') this.attrs(m.target);
        else for (const n of m.addedNodes) this.node(n);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: this.ATTRS });
  },
};
I18N.start();
