// 튜토리얼: 단계마다 할 일 · 열어 줄 탭 · 깜빡일 카드 · 맵에서 깜빡일 칸.
// done() 이 참이 되면 자동으로 다음 단계로 넘어간다. 진행은 Game.s.tut 에 저장.
const Tutorial = {
  steps: [
    {
      title: '중앙 보일러 놓기',
      text: '🔧 설비 탭에서 [중앙 증기 보일러]를 고르고, 왼쪽 벽의 파란 밸브(수도 인입구) 가까운 바닥을 누르세요. 끌어서 자리를 맞춘 뒤 아래 [✓ 설치]를 눌러야 실제로 지어집니다. 모든 증기가 여기서 나옵니다.',
      tab: 'utility', card: 'object:boiler',
      done: g => g.s.objects.some(o => o.id === 'boiler'),
      targets: g => { const l = g.inlet; return [[l.x, l.y], [1, l.y], [2, l.y], [1, l.y + 1], [2, l.y + 1]].filter(([x, y]) => g.inGrid(x, y)); },
    },
    {
      title: '급수관: 인입구 → 보일러',
      text: '[급수관]을 고르고 인입구 바로 오른쪽 칸에서 보일러 옆 칸까지 드래그한 뒤 [✓ 깔기]로 확정하세요. 배관은 설비 밑이나 바로 옆 칸을 지나가야 연결됩니다.',
      tab: 'utility', card: 'pipe:cold',
      done: g => g.rt.nets.boilerFed,
      targets: g => { const l = g.inlet, b = g.s.objects.find(o => o.id === 'boiler'); return [[l.x + 1, l.y], ...(b ? g.footprint(b) : [])]; },
    },
    {
      title: '바닥재 깔기',
      text: '🎨 인테리어 › 바닥에서 재질 카드를 고르고 맵을 드래그하거나 [🖌 전체 선택]을 누른 뒤, 아래 [✓ 칠하기]로 확정하세요. 가구와 주방 설비는 바닥재 위에만 놓을 수 있어요.',
      tab: 'interior', sub: 'floor',
      done: g => { let n = 0, d = 0; for (let y = 1; y < g.s.H - 1; y++) for (let x = 1; x < g.s.W - 1; x++) { n++; if (g.s.floor[g.idx(x, y)] !== 'dirt') d++; } return d / n >= 0.6; },
    },
    {
      title: '서빙 카운터',
      text: '인테리어 › 주방에서 [서빙 카운터]를 놓으세요. 완성된 메뉴가 여기 진열되고, 바리스타가 이 옆에 섭니다.',
      tab: 'interior', sub: 'kitchen', card: 'object:counter',
      done: g => g.s.objects.some(o => o.id === 'counter'),
    },
    {
      title: '싱크대 + 급수·급탕',
      text: '주방 › [도자기 싱크대]를 놓고, 🔧 설비 탭에서 두 배관을 싱크대 밑이나 옆까지 이으세요.\n· 급수관(파랑): 인입구 쪽 급수관에서 이어서\n· 급탕(증기)관(빨강): 보일러에서 시작\n위생 때문에 연결된 싱크대가 있어야 영업할 수 있어요.',
      tab: 'interior', sub: 'kitchen', card: 'object:sink',
      done: g => g.s.objects.some(o => o.id === 'sink' && g.working(o)),
      targets: g => g.s.objects.filter(o => o.id === 'sink' || o.id === 'boiler').flatMap(o => g.footprint(o)),
      after: g => g.s.objects.some(o => o.id === 'sink') ? { tab: 'utility' } : null,
    },
    {
      title: '조리 설비',
      text: '주방 › [황동 에스프레소 머신](급수 + 급탕 필요) 또는 [구리 티 케틀](급탕만 필요)을 놓고 배관을 이으세요. 설비 탭의 "설비 상태"에서 무엇이 빠졌는지 볼 수 있어요.\n(보일러를 눌러 군고구마도 구울 수 있어요. 조리 설비는 [나중에] 놓아도 돼요.)',
      tab: 'interior', sub: 'kitchen', card: 'object:espresso',
      done: g => g.s.objects.some(o => o.id !== 'boiler' && DATA.objects[o.id].cook && g.working(o)), optional: true,
      targets: g => g.s.objects.filter(o => DATA.objects[o.id].cook || o.id === 'boiler').flatMap(o => g.footprint(o)),
      after: g => g.s.objects.some(o => o.id !== 'boiler' && DATA.objects[o.id].cook) ? { tab: 'utility' } : null,
    },
    {
      title: '테이블과 의자',
      text: '인테리어 › 가구에서 테이블을 놓고, 의자를 테이블 상하좌우에 붙여 놓으세요. 입구에서 걸어갈 수 있어야 좌석이 됩니다.',
      tab: 'interior', sub: 'furniture', card: 'object:table_wood',
      done: g => g.reachableSeats().length > 0,
    },
    {
      title: '조명 (밤 대비)',
      text: '해가 지면 조명이 안 닿는 자리의 손님은 만족도가 떨어집니다. 인테리어 › 💡조명에서 가스 램프나 스탠드 가스등을 좌석 근처에 두세요. 놓을 때 노란 원이 비추는 범위예요.',
      tab: 'interior', sub: 'light', card: 'object:gaslamp', optional: true,
      done: g => g.litSeats() >= 0.8,
    },
    {
      title: '영업 시작!',
      text: '위쪽 [☕ 영업 시작]을 누르세요. 조리 설비를 클릭해 메뉴를 만들고, 완성 말풍선을 클릭하면 카운터로 옮겨집니다. 석탄은 🛒 상점에서 사요.\n추가로: 바닥 난방관을 깔면 실내가 따뜻해지고, 오브젝트를 클릭하면 옮기기·뒤집기·철거를 할 수 있어요.',
      tab: 'ops',
      done: g => g.s.open || g.s.day > 1,
    },
  ],

  state() { const s = Game.s; s.tut ??= { i: 0, off: s.day > 1 || !!s.tutorialDone }; return s.tut; },
  current() { const t = this.state(); return t.off ? null : this.steps[t.i] || null; },

  // 매 갱신마다: 끝난 단계는 넘기고 상자를 그린다
  tick() {
    if (!Game.s) return;
    const t = this.state();
    let moved = false;
    while (!t.off && this.steps[t.i] && this.steps[t.i].done(Game)) { t.i++; moved = true; }
    if (!t.off && t.i >= this.steps.length) { t.off = true; Game.toast('🎓 튜토리얼 완료! 메뉴(☰)에서 다시 볼 수 있어요', 'good'); Game.save(); }
    if (moved && !t.off) { this.focus(); this._flash = true; }
    this.renderBox();
    this.markCard();
  },

  // 단계에 맞는 탭 열기
  focus() {
    const st = this.current(); if (!st) return;
    const a = st.after && st.after(Game);
    const tab = (a && a.tab) || st.tab;
    if (tab && UI.state.mode !== tab) UI.setMode(tab);
    if (st.sub && tab === 'interior' && UI.state.sub !== st.sub) { UI.state.sub = st.sub; UI.refresh(); }
  },

  markCard() {
    const st = this.current();
    document.querySelectorAll('.card.tut').forEach(c => c.classList.remove('tut'));
    if (st && st.card) { const c = document.querySelector(`.card[data-key="${st.card}"]`); if (c) c.classList.add('tut'); }
    // 눌러야 할 탭도 깜빡 (모바일에서 시트가 닫혀 있을 때 특히)
    document.querySelectorAll('#tabs .tut').forEach(b => b.classList.remove('tut'));
    if (st && !UI.state.tool) {
      const a = st.after && st.after(Game), tab = (a && a.tab) || st.tab;
      const sheetClosed = UI.isSheet() && !document.body.classList.contains('sheet-open');
      if (tab && (tab !== UI.state.mode || sheetClosed)) { const b = document.querySelector(`#tabs [data-tab="${tab}"]`); if (b) b.classList.add('tut'); }
    }
  },

  targets() { const st = this.current(); return st && st.targets ? st.targets(Game) : []; },

  renderBox() {
    const el = document.getElementById('tutorial'); if (!el) return;
    const t = this.state(), st = this.current();
    if (!st) { el.hidden = true; this._sig = ''; return; }
    // 모바일은 기본으로 접어 둔다 (제목 한 줄만). 누르면 펼침
    if (t.min === undefined) t.min = UI.isSheet();
    const sig = t.i + '|' + UI.state.mode + '|' + t.min;
    el.hidden = false;
    if (sig === this._sig) return;
    this._sig = sig;
    el.classList.toggle('min', !!t.min);
    if (this._flash) { this._flash = false; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    const toggle = () => { t.min = !t.min; this.renderBox(); };
    const head = h('div', { class: 'tut-head' },
      h('b', { class: 'tut-title', onclick: toggle }, `🎓 ${t.i + 1}/${this.steps.length} · ${st.title}`),
      h('span', { class: 'tut-hbtns' },
        h('button', { class: 'x', title: t.min ? '펼치기' : '접기', onclick: toggle }, t.min ? '▾' : '▴'),
        h('button', { class: 'x', title: '튜토리얼 끄기', onclick: () => { t.off = true; Game.save(); this.tick(); } }, '✕')));
    if (t.min) return el.replaceChildren(head);
    el.replaceChildren(
      head,
      h('p', {}, ...I18N.t(st.text).split('\n').flatMap((line, k) => k ? [h('br'), line] : [line])),
      h('div', { class: 'tut-btns' },
        h('button', { class: 'btn ghost', onclick: () => { this.focus(); if (UI.isSheet()) UI.openSheet(); } }, '여기로 이동'),
        st.optional ? h('button', { class: 'btn ghost', onclick: () => { t.i++; this.focus(); this.tick(); } }, '나중에') : null));
  },

  restart() { const t = this.state(); t.i = 0; t.off = false; this._sig = ''; this.focus(); this.tick(); },
};
