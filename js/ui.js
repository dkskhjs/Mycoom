// DOM UI: 탭 패널, 팝업, 입력 처리
const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(kid));
  return el;
};
const fmt = n => Math.floor(n).toLocaleString('ko-KR');
const pct = r => `${+(r * 100).toFixed(1)}%`;

const UI = {
  state: { mode: 'utility', sub: 'floor', tool: null, hover: null },
  painting: false,

  init() {
    this.tabs = $('#tabs'); this.body = $('#panelBody');
    this.tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      if (b.dataset.tab !== this.state.mode) this.setMode(b.dataset.tab);
      if (this.isSheet()) this.openSheet();
    });
    $('#sheetClose').addEventListener('click', () => this.closeSheet());
    window.addEventListener('resize', () => this.placeCamCtl());
    $('#bulkTool').addEventListener('click', () => { const t = this.state.tool; if (t && ['floor', 'wall', 'ceil'].includes(t.kind)) { Game.paintAll(t.kind, t.id); this.syncToolbar(); } });
    matchMedia('(max-width: 860px)').addEventListener?.('change', () => this.closeSheet());
    $('#speed').addEventListener('click', e => {
      const b = e.target.closest('[data-speed]'); if (!b) return;
      const v = +b.dataset.speed;
      Game.paused = v === 0; if (v) Game.speed = v;
      this.syncSpeed();
    });
    $('#openBtn').addEventListener('click', () => {
      if (!Game.s.open) { Game.openCafe(); this.refresh(); return; }
      // 영업 중에 누르면: 확인 후 오늘 영업을 일찍 마감 (정산하고 다음 날로)
      const eating = Game.rt.customers.filter(c => c.state === 'eating').length, waiting = Game.rt.customers.filter(c => c.state === 'waiting' || c.state === 'toSeat').length;
      this.confirm('⏹ 영업 마감', `오늘 영업을 지금 마감할까요? (${Game.timeStr()})${eating ? ` 식사 중인 손님 ${eating}명은 계산하고 나가고,` : ''}${waiting ? ` 기다리던 손님 ${waiting}명은 다음에 오기로 해요.` : ''} 정산 후 다음 날로 넘어갑니다.`,
        '마감하기', () => { Game.closeCafe(); this.refresh(); });
    });
    $('#menuBtn').addEventListener('click', () => this.showSystemMenu());
    $('#autoBtn').addEventListener('click', () => { Game.setAuto(!Game.s.auto); this.refreshLive(); });
    // 패널 숨기기: 화면을 온전히 감상 (모바일에서 특히). 마지막 상태 기억
    const setPanel = hidden => {
      document.body.classList.toggle('panel-hidden', hidden);
      $('#panelBtn').textContent = hidden ? '🛠 패널 보이기' : '🛠 패널 숨기기';
      try { localStorage.setItem('steamcafe_panel_hidden', hidden ? '1' : '0'); } catch (e) {}
      if (App.started) setTimeout(() => Render.resize($('#canvasWrap')), 30);
    };
    this.setPanel = setPanel;
    $('#panelBtn').addEventListener('click', () => setPanel(!document.body.classList.contains('panel-hidden')));
    try { if (localStorage.getItem('steamcafe_panel_hidden') === '1') setPanel(true); } catch (e) {}
    this.bindCanvas();
    Game.on('toast', (m, k) => this.toast(m, k));
    Game.on('built', () => this.refreshLive());
    Game.on('levelUp', () => this.refresh());
    Game.on('dayEnd', s => { this.refresh(); this.showDayEnd(s); });
    Game.on('opened', () => this.refresh());
    Game.on('expanded', () => { Render.flakes = []; Render.resize($('#canvasWrap')); this.refresh(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.cancelTool(); this.closePopup(); }
      if (e.target.closest && e.target.closest('input')) return;
      if (e.key === 'Enter' && this.pending()) { e.preventDefault(); this.confirmTool(); }
      if (e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') this.rotateTool();
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const t = this.state.tool, o = t && t.kind === 'move' && Game.s.objects.find(q => q.uid === t.uid);
        if (o) { e.preventDefault(); Game.removeObject(o); Game.save(); this.setTool(t.fromEdit ? { kind: 'edit' } : null); }
      }
      if (e.key === ' ' && e.target === document.body) { e.preventDefault(); Game.paused = !Game.paused; this.syncSpeed(); }
    });
    setInterval(() => this.refreshLive(), 300);
  },

  syncSpeed() {
    document.querySelectorAll('#speed [data-speed]').forEach(b => {
      const v = +b.dataset.speed;
      b.classList.toggle('on', Game.paused ? v === 0 : v === Game.speed);
    });
  },

  // ───────── 모바일: 패널은 탭을 누르면 화면을 덮는 시트, 배치 도구를 고르면 다시 맵으로 ─────────
  isSheet() { return matchMedia('(max-width: 860px)').matches; },
  openSheet() {
    const tb = $('#topbar').getBoundingClientRect();
    document.documentElement.style.setProperty('--sheet-top', Math.round(tb.bottom) + 'px');
    document.body.classList.add('sheet-open');
    this.closePopup(); Tutorial.markCard();
    const names = { utility: '🔧 설비', interior: '🎨 인테리어', ops: '☕ 운영', shop: '🛒 상점' };
    $('#sheetTitle').textContent = names[this.state.mode] || '';
  },
  closeSheet() { document.body.classList.remove('sheet-open'); if (typeof Tutorial !== 'undefined' && Game.s) Tutorial.markCard(); },
  // 카메라 버튼은 도구 막대 높이에 맞춰 바로 위에
  placeCamCtl() {
    const tb = $('#toolbar'), cc = $('#camctl'); if (tb && cc) cc.style.bottom = (tb.offsetHeight + 8) + 'px';
    document.documentElement.style.setProperty('--sheet-top', Math.round($('#topbar').getBoundingClientRect().bottom) + 'px');
  },
  setMode(mode) {
    this.state.mode = mode; this.setTool(null); this.closePopup();
    document.querySelectorAll('#tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === mode));
    this.refresh();
  },
  setTool(tool) {
    const prev = this.state.tool;
    if (prev && prev !== tool && prev.cells && prev.cells.size) this.toast(`확정하지 않은 ${prev.kind === 'erase' ? '철거' : '배관'} ${prev.cells.size}칸은 취소됐어요`);
    if (tool && (tool.kind === 'pipe' || tool.kind === 'erase')) tool.cells ??= new Set();
    this.state.tool = tool;
    if (tool && tool !== prev) this.closeSheet();   // 배치할 때는 맵 화면으로
    document.querySelectorAll('.card[data-key]').forEach(c => c.classList.toggle('sel', !!tool && c.dataset.key === this.toolKey(tool)));
    this.syncToolbar();
  },
  // 놓을 자리를 정해 둔 상태(미확정)인가
  pending(t = this.state.tool) {
    if (!t) return false;
    if (t.kind === 'object' || t.kind === 'move') return t.px != null;
    if (t.kind === 'pipe' || t.kind === 'erase') return t.cells.size > 0;
    return false;
  },
  pendingOk(t = this.state.tool) {
    if (!this.pending(t)) return false;
    if (t.kind === 'object' || t.kind === 'move') return Game.canPlace(t.id, t.px, t.py, t.uid || 0, t.rot || 0).ok;
    return true;
  },
  syncToolbar() {
    const t = this.state.tool, pend = this.pending(t);
    const hint = !t ? '오브젝트를 클릭해서 사용 · 도구를 골라 건설'
      : t.kind === 'object' || t.kind === 'move' ? `${this.toolName(t)} — ${pend ? '끌어서 위치 조정 · ✓ 로 확정' : '놓을 곳을 누르세요'}`
      : t.kind === 'pipe' || t.kind === 'erase' ? `${this.toolName(t)} — 드래그로 칸 선택 · 선택한 칸을 다시 누르면 빠짐 · ✓ 로 확정`
      : `${this.toolName(t)} — 맵을 클릭/드래그 · ESC/우클릭 취소`;
    $('#toolHint').textContent = hint;
    $('#cancelTool').hidden = !t;
    $('#cancelTool').textContent = pend ? '✕ 취소' : '선택 해제';
    const rb = $('#rotTool');
    if (rb) rb.hidden = !(t && (t.kind === 'object' || t.kind === 'move') && Game.canRotate(t.id));
    requestAnimationFrame(() => this.placeCamCtl());
    const bk = $('#bulkTool');
    if (bk) {
      const paint = t && ['floor', 'wall', 'ceil'].includes(t.kind);
      bk.hidden = !paint;
      if (paint) {
        const inf = Game.paintAllInfo(t.kind, t.id);
        bk.textContent = inf.n ? `🖌 전체 ${inf.n}칸 (${fmt(inf.cost)})` : '🖌 전부 이 재질';
        bk.disabled = !inf.n || Game.s.money < inf.cost;
      }
    }
    const ok = $('#okTool'); if (!ok) return;
    ok.hidden = !pend;
    if (!pend) return;
    const good = this.pendingOk(t);
    ok.classList.toggle('bad', !good);
    ok.textContent = t.kind === 'object' ? `✓ 설치 (${fmt(DATA.objects[t.id].cost)})`
      : t.kind === 'move' ? '✓ 여기에 두기'
      : t.kind === 'pipe' ? `✓ ${t.cells.size}칸 깔기 (${fmt(t.cells.size * DATA.pipes[t.type].cost)})`
      : `✓ ${t.cells.size}칸 철거`;
    ok.title = good ? 'Enter' : Game.canPlace(t.id, t.px, t.py, t.uid || 0, t.rot || 0).why;
  },
  // ✓ 확정
  confirmTool() {
    const t = this.state.tool;
    if (!this.pending(t)) return;
    if (t.kind === 'object') {
      if (Game.placeObject(t.id, t.px, t.py, t.rot || 0)) { Game.save(); t.px = t.py = null; if (DATA.objects[t.id].unique) return this.setTool(null); }
    } else if (t.kind === 'move') {
      const o = Game.s.objects.find(q => q.uid === t.uid);
      if (!o) return this.setTool(null);
      if (Game.moveObject(o, t.px, t.py, t.rot || 0)) return this.setTool(t.fromEdit ? { kind: 'edit' } : null);
    } else if (t.kind === 'pipe') {
      if (Game.placePipes(t.type, [...t.cells])) { t.cells.clear(); Game.save(); }
    } else if (t.kind === 'erase') {
      for (const i of t.cells) Game.erasePipe(i % Game.s.W, (i / Game.s.W) | 0);
      t.cells.clear(); Game.save();
    }
    this.syncToolbar();
  },
  // ✕: 미확정 자리가 있으면 그것만 지우고, 없으면 도구 해제
  cancelTool() {
    const t = this.state.tool;
    if (t && this.pending(t) && t.kind !== 'move') { if (t.cells) t.cells.clear(); else t.px = t.py = null; return this.syncToolbar(); }
    this.setTool(t && t.kind === 'move' && t.fromEdit ? { kind: 'edit' } : null);
  },
  rotateTool() {
    const t = this.state.tool;
    if (!t || (t.kind !== 'object' && t.kind !== 'move') || !Game.canRotate(t.id)) return;
    t.rot = Game.nextRot(t.id, t.rot || 0);
    this.syncToolbar();
  },
  toolKey(t) { return t.kind + ':' + (t.id || t.type || ''); },
  toolName(t) {
    if (t.kind === 'object') return DATA.objects[t.id].name;
    if (t.kind === 'pipe') return DATA.pipes[t.type].name + ' 깔기';
    if (t.kind === 'erase') return '배관 철거';
    if (t.kind === 'remove') return '오브젝트 철거';
    if (t.kind === 'edit') return '✥ 편집 — 옮길 오브젝트를 클릭해 들어 올리세요';
    if (t.kind === 'move') return `${DATA.objects[t.id].name} 옮기기 — 놓을 곳 클릭${Game.canRotate(t.id) ? ' · R 회전' : ''} · Del 철거`;
    const tbl = { floor: DATA.floors, wall: DATA.walls, ceil: DATA.ceilings }[t.kind];
    return tbl[t.id].name + ' 바르기';
  },

  // ───────── 패널 ─────────
  refresh() {
    const m = this.state.mode;
    this.body.innerHTML = '';
    if (m === 'utility') this.renderUtility();
    else if (m === 'interior') this.renderInterior();
    else if (m === 'ops') this.renderOps();
    else if (m === 'shop') this.renderShop();
    this.setTool(this.state.tool);
    this.refreshLive();
  },

  card({ key, thumb, name, cost, lines = [], lv = 1, onClick }) {
    const locked = lv > Game.s.level;
    const el = h('button', { class: 'card' + (locked ? ' locked' : ''), 'data-key': key, 'data-cost': cost || 0, title: name },
      h('div', { class: 'thumb' }, thumb),
      h('div', { class: 'cname' }, name),
      h('div', { class: 'cmeta' }, locked ? `🔒 Lv.${lv}` : (cost ? `🪙${fmt(cost)}` : '무료')),
      ...lines.map(l => h('div', { class: 'cmeta dim' }, l)));
    el.addEventListener('click', () => { if (!locked) onClick(); else this.toast(`레벨 ${lv}에 해금됩니다`, 'bad'); });
    return el;
  },

  renderUtility() {
    const B = this.body;
    B.append(h('p', { class: 'tip' }, '왼쪽 벽의 파란 밸브가 수도 인입구입니다. 인입구 → 보일러로 급수관을 잇고, 보일러에서 급탕관과 난방관을 뻗어 각 설비에 연결하세요. 배관은 설비 밑이나 바로 옆 칸을 지나가면 연결됩니다.'));
    const grid = h('div', { class: 'grid' });
    for (const id of ['boiler', 'radiator', 'automaton']) {
      const d = DATA.objects[id];
      grid.append(this.card({ key: 'object:' + id, thumb: Sprites.thumb('obj', id, 40), name: d.name, cost: d.cost, lv: d.lv, lines: [this.needsText(d)], onClick: () => this.setTool({ kind: 'object', id }) }));
    }
    for (const [type, p] of Object.entries(DATA.pipes)) {
      grid.append(this.card({ key: 'pipe:' + type, thumb: this.pipeThumb(type), name: p.name, cost: p.cost, lines: ['칸당'], onClick: () => this.setTool({ kind: 'pipe', type }) }));
    }
    grid.append(this.card({ key: 'erase:', thumb: this.textThumb('✖', '#ff8a7a'), name: '배관 철거', cost: 0, onClick: () => this.setTool({ kind: 'erase' }) }));
    grid.append(this.card({ key: 'edit:', thumb: this.textThumb('✥', '#9fd6ff'), name: '편집 (이동·회전)', cost: 0, lines: ['클릭해 들기 · R 회전'], onClick: () => this.setTool({ kind: 'edit' }) }));
    grid.append(this.card({ key: 'remove:', thumb: this.textThumb('⚒', '#ffb070'), name: '오브젝트 철거', cost: 0, lines: ['50% 환급'], onClick: () => this.setTool({ kind: 'remove' }) }));
    B.append(grid);
    B.append(h('h3', {}, '설비 상태'), h('div', { id: 'live-util', class: 'live' }));
  },

  renderInterior() {
    const B = this.body, sub = this.state.sub;
    const subs = [['floor', '바닥'], ['wall', '벽'], ['ceil', '천장'], ['light', '💡조명'], ['kitchen', '주방'], ['furniture', '가구'], ['decor', '장식']];
    const nav = h('div', { class: 'subtabs' }, subs.map(([k, n]) => h('button', { class: k === sub ? 'on' : '', onclick: () => { this.state.sub = k; this.setTool(null); this.refresh(); } }, n)));
    B.append(nav);
    const grid = h('div', { class: 'grid' });
    const matTable = { floor: DATA.floors, wall: DATA.walls, ceil: DATA.ceilings }[sub];
    if (matTable) {
      for (const [id, m] of Object.entries(matTable)) {
        grid.append(this.card({ key: `${sub}:${id}`, thumb: Sprites.thumb(sub, id, 40), name: m.name, cost: m.cost, lv: m.lv, lines: [`분위기 +${m.appeal}`], onClick: () => this.setTool({ kind: sub, id }) }));
      }
    }
    const cat = sub === 'ceil' ? 'ceilitem' : sub;
    for (const [id, d] of Object.entries(DATA.objects)) {
      if (sub === 'light' ? !d.light : d.cat !== cat) continue;
      grid.append(this.card({ key: 'object:' + id, thumb: Sprites.thumb('obj', id, 40), name: d.name, cost: d.cost, lv: d.lv, lines: [`분위기 +${d.appeal}`, d.light ? `💡 조명 ${d.light}칸` : '', this.needsText(d)].filter(Boolean), onClick: () => this.setTool({ kind: 'object', id }) }));
    }
    if (!matTable || sub === 'ceil' || sub === 'light') grid.append(this.card({ key: 'edit:', thumb: this.textThumb('✥', '#9fd6ff'), name: '편집 (이동·회전)', cost: 0, lines: ['클릭해 들기 · R 회전'], onClick: () => this.setTool({ kind: 'edit' }) }));
    if (!matTable || sub === 'ceil' || sub === 'light') grid.append(this.card({ key: 'remove:', thumb: this.textThumb('⚒', '#ffb070'), name: '철거', cost: 0, lines: ['50% 환급'], onClick: () => this.setTool({ kind: 'remove' }) }));
    B.append(grid);
    if (matTable) B.append(h('div', { id: 'live-bulk', class: 'bulk' }));
    const tips = {
      floor: '바닥재 위에만 가구를 놓을 수 있어요. 드래그해서 칠하세요.',
      wall: '바깥 테두리 벽에 칠합니다. 스테인드글라스 창은 분위기가 높아요.',
      ceil: '천장 보기 상태입니다. 천장 마감과 조명은 저녁 분위기를 좌우해요.',
      kitchen: '조리 설비는 증기 배관이 연결돼야 작동합니다. 카운터에 완성품이 진열됩니다.',
      furniture: '의자는 테이블과 상하좌우로 붙어 있어야 좌석이 됩니다.',
      decor: '장식은 분위기 점수를 올려 손님과 팁을 늘려줍니다.',
      light: '해가 지면 조명이 닿지 않는 자리의 손님은 만족도가 떨어져요. 놓을 때 노란 원이 비추는 범위입니다. 천장 조명은 천장 보기에서, 스탠드·테이블 램프는 바닥에 놓습니다.',
    };
    B.append(h('p', { class: 'tip' }, tips[sub]));
    B.append(h('div', { id: 'live-appeal', class: 'live' }));
  },

  renderOps() {
    const B = this.body;
    B.append(h('div', { id: 'live-ops', class: 'live' }));
    B.append(h('h3', {}, '👥 직원'), h('div', { id: 'live-crew', class: 'expand crew' }));
    B.append(h('h3', {}, '메뉴판'));
    const list = h('div', { class: 'menu' });
    for (const [id, r] of Object.entries(DATA.recipes)) {
      const locked = r.lv > Game.s.level;
      list.append(h('div', { class: 'mrow' + (locked ? ' locked' : '') },
        Sprites.thumb('icon', id, 18),
        h('span', { class: 'mname' }, r.name),
        h('span', { class: 'dim' }, locked ? `🔒Lv.${r.lv}` : `${DATA.objects[r.eq].name.split(' ').pop()} · ${r.time}분 · ×${r.yield}`),
        h('span', { class: 'mprice' }, `🪙${r.price}`)));
    }
    B.append(list);
    B.append(h('p', { class: 'tip' }, '조리 설비를 클릭해 메뉴를 만들고, 완성 말풍선을 클릭해 카운터로 옮기세요. 손님은 카운터에 있는 메뉴를 받아갑니다.'));
  },

  renderShop() {
    const B = this.body;
    B.append(h('h3', {}, '재료 상점'));
    const list = h('div', { class: 'shop' });
    for (const [id, ing] of Object.entries(DATA.ingredients)) {
      list.append(h('div', { class: 'srow' },
        h('span', { class: 'sicon' }, ing.icon), h('span', { class: 'mname' }, ing.name),
        h('span', { class: 'dim', 'data-stock': id }, ''),
        h('button', { class: 'btn', onclick: () => this.showBuy(id) }, `구매 · 🪙${ing.price}/${ing.pack}개`)));
    }
    list.append(h('div', { class: 'srow' },
      h('span', { class: 'sicon' }, '⚫'), h('span', { class: 'mname' }, '석탄'),
      h('span', { class: 'dim', 'data-stock': 'coal' }, ''),
      h('button', { class: 'btn', id: 'coalBtn', onclick: () => this.showBuy('coal') }, '')));
    B.append(list);
    B.append(h('h3', {}, '🏦 증기 은행'), h('div', { id: 'live-bank', class: 'expand' }));
    B.append(h('p', { class: 'tip' }, `대출금은 바로 입금되고, 원금과 이자를 정해진 날 수로 나눠 매일 영업 마감 때 자동으로 갚습니다. 그날 돈이 모자라면 ${Game.diff().lateFee ? `연체료(상환금의 ${Math.round(DATA.loanLateFee * Game.diff().lateFee * 100)}%)가 붙고 ` : ''}평판이 떨어져요${Game.diff().repLoss ? '' : ' (쉬움: 평판·연체료 없음)'}. 언제든 미리 갚을 수 있습니다.`));
    B.append(h('h3', {}, '🐈 고양이 입양'), h('div', { id: 'live-cats', class: 'expand' }));
    B.append(h('p', { class: 'tip' }, `고양이는 따뜻한 난방 칸에서 낮잠을 잡니다. 분위기 +${DATA.catAppeal}, 근처 손님 만족도 상승, 체온으로 현열·잠열을 조금 냅니다. 사료비 하루 🪙${DATA.catFoodPerDay}/마리.`));
    B.append(h('h3', {}, '🏗 공간 확장'), h('div', { id: 'live-expand', class: 'expand' }));
    B.append(h('p', { class: 'tip' }, '영업 전에만 공사할 수 있습니다. 넓어진 칸은 맨흙이라 바닥재를 새로 깔아야 하고, 북쪽 확장은 기존 가게가 통째로 아래로 밀립니다(배관·가구는 그대로 이어짐).'));
    B.append(h('p', { class: 'tip' }, '석탄은 보일러 연료입니다. 난방 칸이 많을수록, 눈보라일수록 빨리 탑니다. 떨어지면 모든 증기 설비가 멈춰요!'));
  },

  needsText(d) {
    const nm = { cold: '급수', hot: '증기', heat: '난방' };
    return d.needs && d.needs.length ? '필요: ' + d.needs.map(n => nm[n]).join('+') : '';
  },
  pipeThumb(type) {
    const [c, g] = makeCanvas(16, 16); const P = pen(g);
    P.r(0, 0, 16, 16, PAL.d);
    if (type === 'heat') { [2, 7, 12].forEach(y => P.r(1, y, 14, 1, PAL.glow1)); P.r(14, 2, 1, 6, PAL.glow1); P.r(1, 7, 1, 6, PAL.glow1); }
    else { const col = type === 'cold' ? PAL.bl2 : PAL.red2; P.r(0, 6, 16, 4, PAL.k); P.r(0, 7, 16, 2, col); P.r(0, 7, 16, 1, type === 'cold' ? PAL.bl3 : PAL.red3); P.r(7, 6, 2, 4, PAL.b2); }
    const [o, og] = makeCanvas(48, 48); og.imageSmoothingEnabled = false; og.drawImage(c, 0, 0, 48, 48); o.className = 'pix'; return o;
  },
  textThumb(t, color) { return h('span', { class: 'tthumb', style: `color:${color}` }, t); },

  // ───────── 실시간 갱신 ─────────
  refreshLive() {
    const s = Game.s; if (!s) return;
    const n = Game.rt.nets;
    // 상단 바
    $('#money').textContent = fmt(s.money);
    $('#money').parentElement.title = Game.debt() ? `돈 (빚 ${fmt(Game.debt())})` : '돈';
    $('#money').parentElement.classList.toggle('debt', Game.debt() > 0);
    $('#coal').textContent = Math.floor(s.coal);
    $('#coal').parentElement.classList.toggle('warn', s.coal < 15);
    const stars = s.rep / 20;
    $('#rep').textContent = '★'.repeat(Math.floor(stars)) + (stars % 1 >= 0.5 ? '☆' : '') || '☆';
    $('#rep').title = `평판 ${s.rep.toFixed(1)}/100`;
    const lvNext = DATA.levels[s.level] ?? s.xp, lvPrev = DATA.levels[s.level - 1] ?? 0;
    $('#lv').textContent = s.level;
    $('#xpbar').style.width = Math.min(100, (s.xp - lvPrev) / Math.max(1, lvNext - lvPrev) * 100) + '%';
    $('#clock').textContent = `${s.day}일차 ${Game.timeStr()}`;
    const w = Game.weather();
    $('#weather').textContent = `${Game.hasEvent('blizzard') ? '🌨 눈보라' : w.icon + ' ' + w.name} ${Math.round(Game.outdoorTemp())}°`;
    const it = Game.indoorTemp();
    $('#indoor').textContent = `실내 ${Math.round(it)}° 💧${Math.round(Game.humidity())}%`;
    $('#indoor').parentElement.className = 'stat ' + (it >= 20 ? 'good' : it >= 18 ? '' : 'warn');
    const ab = $('#autoBtn'); ab.classList.toggle('on', !!s.auto); ab.textContent = s.auto ? '🤖 자동 ON' : '🤖 자동';
    const ob = $('#openBtn');
    ob.textContent = s.open ? '영업 중 ⏹' : '☕ 영업 시작';
    ob.title = s.open ? '눌러서 오늘 영업 마감' : '영업 시작';
    ob.classList.toggle('open', !!s.open); ob.classList.toggle('ready', !s.open && Game.canOpen());

    // 이벤트 배너
    this.renderBanner();
    if (typeof Tutorial !== 'undefined') Tutorial.tick();

    // 카드 가격
    document.querySelectorAll('.card[data-cost]').forEach(c => c.classList.toggle('poor', +c.dataset.cost > s.money));

    const lu = $('#live-util');
    if (lu) {
      const boiler = s.objects.find(o => o.id === 'boiler');
      const run = Game.boilerRunning();
      const rows = [];
      rows.push(this.statusRow(!!boiler, '보일러 설치'));
      if (boiler) {
        rows.push(this.statusRow(n.boilerFed, '급수 공급 (인입구 연결)'));
        rows.push(this.statusRow(s.coal > 0, `석탄 ${Math.floor(s.coal)}`));
        rows.push(this.statusRow(!s.boiler.broken, s.boiler.broken ? '고장! 보일러를 클릭해 수리' : '정상'));
        rows.push(h('div', { class: 'gauge' }, h('span', {}, '압력'), h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, s.boiler.pressure)}%;background:${s.boiler.pressure > 80 ? '#d1584f' : s.boiler.pressure > 65 ? '#efc760' : '#6aa84f'}` })), h('span', {}, Math.round(s.boiler.pressure))));
      }
      const th = Game.thermal();
      rows.push(h('div', { class: 'srow2' }, `난방 커버 ${Math.round(Game.heatPower() * 100)}% · 실내 ${Math.round(it)}° / 실외 ${Math.round(Game.outdoorTemp())}° · 습도 ${Math.round(th.rh)}%`));
      rows.push(h('div', { class: 'thermo' },
        h('div', {}, `필요 난방 ${fmt(th.demand)}W − 내부 발열 ${fmt(Math.max(0, th.gains.sens))}W = 난방부하 ${fmt(th.load)}W`),
        h('div', { class: 'dim' }, `보일러 공급 ${fmt(th.supply)}W / 최대 ${fmt(th.cap)}W${th.saved > 0 ? ` · 발열로 ${Math.round(th.saved / Math.max(1, th.demand) * 100)}% 절약` : ''}`),
        ...th.gains.rows.map(r => h('div', { class: 'dim gainrow' }, `· ${r.label}${r.n > 1 ? ' ×' + r.n : ''}: 현열 ${r.sens}W / 잠열 ${r.lat}W`))));
      const eq = s.objects.filter(o => DATA.objects[o.id].needs && DATA.objects[o.id].needs.length && o.id !== 'boiler');
      if (eq.length) {
        rows.push(h('div', { class: 'dim', style: 'margin-top:6px' }, '설비 연결'));
        const nm = { cold: '급수', hot: '증기', heat: '난방' };
        for (const o of eq) {
          const miss = Game.missingNeeds(o);
          rows.push(this.statusRow(Game.working(o), `${DATA.objects[o.id].name}${miss.length ? ' — ' + miss.map(m => nm[m]).join(',') + ' 미연결' : (Game.working(o) ? '' : ' — 보일러 정지')}`));
        }
      }
      if (s.leaks.length) rows.push(h('div', { class: 'bad' }, `💧 누수 ${s.leaks.length}곳 — 깜빡이는 칸을 클릭해 수리`));
      lu.replaceChildren(...rows);
    }
    const la = $('#live-appeal');
    if (la) la.replaceChildren(h('div', {}, `분위기 점수 ${n.density.toFixed(1)}  (총 ${Math.round(n.appeal)} / ${n.interior}칸)`), h('div', { class: 'dim' }, `좌석 ${n.seats.length}개 · 💡 조명 커버 ${Math.round(Game.lightCoverage() * 100)}% (좌석 ${Math.round(Game.litSeats() * 100)}%)`));
    const lbk = $('#live-bulk'), tl = this.state.tool;
    if (lbk) {
      const sub = this.state.sub, sig = JSON.stringify([tl, s.money >= 0 && Math.floor(s.money / 50), s.W, s.H]);
      if (lbk.dataset.sig !== sig) {
        lbk.dataset.sig = sig;
        if (tl && tl.kind === sub) {
          const tbl = { floor: DATA.floors, wall: DATA.walls, ceil: DATA.ceilings }[sub], inf = Game.paintAllInfo(sub, tl.id);
          const where = sub === 'wall' ? '바깥 벽 전체' : sub === 'ceil' ? '천장 전체' : '바닥 전체';
          lbk.replaceChildren(h('button', { class: 'btn big', disabled: !inf.n || s.money < inf.cost, onclick: () => Game.paintAll(sub, tl.id) },
            inf.n ? `🖌 ${tbl[tl.id].name} → ${where} 일괄 적용 (${inf.n}칸 · 🪙${fmt(inf.cost)})` : '이미 전부 이 재질'));
        } else lbk.replaceChildren(h('div', { class: 'dim' }, '재질 카드를 고르면 전체 일괄 적용 버튼이 나옵니다.'));
      }
    }
    const lo = $('#live-ops');
    if (lo) {
      const kids = [];
      if (!s.open) {
        kids.push(h('h3', {}, '영업 준비 체크리스트'));
        for (const c of Game.openChecklist()) kids.push(this.statusRow(c.ok, c.text));
      } else {
        kids.push(h('h3', {}, `오늘 영업 (${Game.timeStr()} / ${CLOSE_HOUR}:00 마감)`));
      }
      kids.push(h('h3', {}, '카운터 진열'));
      const chips = h('div', { class: 'chips' });
      const ent = Object.entries(s.counter).filter(([, v]) => v > 0);
      if (!ent.length) chips.append(h('span', { class: 'dim' }, '비어 있음'));
      for (const [id, v] of ent) chips.append(h('span', { class: 'chip' }, Sprites.thumb('icon', id, 18), `${DATA.recipes[id].name} ×${v}`));
      kids.push(chips);
      kids.push(h('h3', {}, '재료'));
      const chips2 = h('div', { class: 'chips' });
      for (const [id, ing] of Object.entries(DATA.ingredients)) chips2.append(h('span', { class: 'chip' + (s.stock[id] < 2 ? ' low' : '') }, `${ing.icon}${ing.name} ${s.stock[id]}`));
      kids.push(chips2);
      const t = s.today;
      kids.push(h('h3', {}, '오늘'), h('div', {}, `손님 ${t.served}명 · 화난 손님 ${t.angry}명 · 매출 ${fmt(t.revenue)} · 팁 ${fmt(t.tips)}`));
      if (s.stains.length) kids.push(h('div', { class: 'bad' }, `☕ 커피 얼룩 ${s.stains.length}개 — 클릭해서 닦기 (분위기 −${s.stains.length * DATA.stain.appeal})`));
      kids.push(h('div', { class: Game.litSeats() < 0.8 ? 'bad' : 'dim' }, `💡 밤 조명이 닿는 좌석 ${Math.round(Game.litSeats() * 100)}% (인테리어 › 💡조명)`));
      kids.push(h('div', { class: 'dim' }, `현재 손님 ${Game.rt.customers.filter(c => c.state !== 'pass').length} · 분위기 ${n.density.toFixed(1)} · 평판 ${s.rep.toFixed(0)}`));
      lo.replaceChildren(...kids);
    }
    document.querySelectorAll('[data-stock]').forEach(el => {
      const k = el.dataset.stock;
      el.textContent = k === 'coal' ? `보유 ${Math.floor(s.coal)}` : `보유 ${s.stock[k]}`;
    });
    const lb = $('#live-bank');
    if (lb) {
      const sig = JSON.stringify([s.loans, s.level, Math.round(s.rep), Math.floor(s.money / 100)]);
      if (lb.dataset.sig !== sig) {
        lb.dataset.sig = sig;
        const kids = [h('div', { class: 'dim' }, `빚 ${fmt(Game.debt())} / 한도 ${fmt(Game.loanLimit())} (레벨·평판이 오르면 늘어남)`)];
        for (const l of s.loans) {
          kids.push(h('div', { class: 'srow' + (l.missed ? ' late' : '') },
            h('span', { class: 'mname' }, `${l.name}${l.missed ? ` ⚠연체 ${l.missed}회` : ''}`),
            h('span', { class: 'dim' }, `남은 ${fmt(l.balance)} · 매일 ${fmt(Math.min(l.perDay, l.balance))}`),
            h('span', { class: 'btns' },
              h('button', { class: 'btn ghost', disabled: s.money < 1, onclick: () => Game.repayLoan(l.uid, l.perDay) }, '하루치'),
              h('button', { class: 'btn', disabled: s.money < l.balance, onclick: () => Game.repayLoan(l.uid) }, '완납'))));
        }
        for (const d of DATA.loans) {
          const inf = Game.loanInfo(d.id);
          kids.push(h('div', { class: 'srow' },
            h('span', { class: 'mname' }, `${d.name} 🪙${fmt(d.amount)}`),
            h('span', { class: 'dim' }, `이자 ${pct(inf.rate)} · ${d.days}일 · 매일 ${fmt(inf.perDay)}`),
            h('button', { class: 'btn', disabled: !!inf.why, onclick: () => this.confirm(`🏦 ${d.name}`, `🪙${fmt(d.amount)}을 빌립니다. 이자 ${pct(inf.rate)} (총 🪙${fmt(inf.total)}) · ${d.days}일 동안 매일 마감 때 🪙${fmt(inf.perDay)}씩 자동 상환`, '빌리기', () => Game.takeLoan(d.id)) }, inf.why || '빌리기')));
        }
        lb.replaceChildren(...kids);
      }
    }
    const lcw = $('#live-crew');
    if (lcw) {
      const sig = JSON.stringify([s.crew, s.level, Math.floor(s.money / 100)]);
      if (lcw.dataset.sig !== sig) {
        lcw.dataset.sig = sig;
        const people = s.crew.filter(c => !Game.isRobot(c.kind)).length, bots = s.crew.length - people;
        const kids = [h('div', { class: 'dim' }, `직원 ${people}/${Game.staffCap()}명 · 일급 합계 🪙${fmt(Game.wages())} · 🤖 로봇 ${bots}/${Game.robotCap()}대 · 석탄 ${Game.robotCoal()}/일 (영업 마감 때)`)];
        for (const c of s.crew) {
          const d = DATA.staff[c.kind];
          kids.push(h('div', { class: 'srow' },
            h('span', { class: 'mname' }, d.robot ? Sprites.thumb('robot', d.robot, 32) : Sprites.hasChar(Game.crewChar(c)) ? Sprites.thumb('uniform', `${Game.crewChar(c)}|${d.uniform}`, 32) : '', ` ${d.icon} ${c.name}`),
            h('span', { class: 'dim' }, d.robot ? `${d.name} · ⚫${d.coal}/일` : `${d.name} · 일급 ${d.wage}`),
            h('button', { class: 'btn ghost', onclick: () => this.confirm(`${c.name} 내보내기`, `${d.name} ${c.name}을(를) 내보낼까요? 고용비는 돌려받지 못해요.`, '내보내기', () => Game.fire(c.uid)) }, '해고')));
        }
        let robotHead = false;
        for (const [k, d] of Object.entries(DATA.staff)) {
          const inf = Game.hireInfo(k);
          if (d.robot && !robotHead) { robotHead = true; kids.push(h('div', { class: 'subhead' }, '🤖 증기 로봇 — 일급 없이 석탄으로 움직이고, 보일러가 멈추면 같이 멈춰요')); }
          kids.push(h('div', { class: 'srow hire' + (d.robot ? ' robot' : '') },
            h('span', { class: 'mname' }, h('b', {}, d.robot ? h('span', {}, Sprites.thumb('robot', d.robot, 24), ` ${d.name}`) : `${d.icon} ${d.name}`), h('div', { class: 'dim small' }, d.desc)),
            h('span', { class: 'dim' }, `${d.robot ? `⚫${d.coal}/일` : `일급 ${d.wage}`}${inf.n ? ` · ${inf.n}/${d.max}` : ''}`),
            h('button', { class: 'btn', disabled: !!inf.why && inf.why !== '돈 부족', title: inf.why || '', onclick: () => this.confirm(`${d.icon} ${d.name} ${d.robot ? '구입' : '고용'}`, `${d.desc}. ${d.robot ? `구입비 🪙${fmt(d.hire)} · 매일 석탄 ${d.coal}` : `고용비 🪙${fmt(d.hire)} · 일급 🪙${d.wage}`} (매일 영업 마감 때)`, `${d.robot ? '구입' : '고용'} (🪙${fmt(d.hire)})`, () => Game.hire(k)) },
              inf.why && inf.why !== '돈 부족' ? inf.why : `🪙${fmt(d.hire)}`)));
        }
        lcw.replaceChildren(...kids);
      }
    }
    const lc = $('#live-cats');
    if (lc) {
      const sig = JSON.stringify([s.cats, s.level, s.money >= 400]);
      if (lc.dataset.sig !== sig) {
        lc.dataset.sig = sig;
        const kids = [h('div', { class: 'dim' }, `우리 고양이 ${s.cats.length}/${DATA.catMax}: ${s.cats.map(c => c.name).join(', ') || '없음'}`)];
        for (const k of DATA.cats) {
          const locked = k.lv > s.level, full = s.cats.length >= DATA.catMax;
          kids.push(h('div', { class: 'srow' }, h('span', { class: 'mname' }, Sprites.thumb('cat', k.id, 32), ' ', k.name),
            h('span', { class: 'dim' }, `${k.kg}kg · 현열 ${k.sens}W · 잠열 ${k.lat}W`),
            h('button', { class: 'btn', disabled: locked || full, onclick: () => this.confirm(`🐈 ${k.name} 입양`, `🪙${fmt(k.cost)} · 사료비 하루 🪙${DATA.catFoodPerDay}`, `입양 (🪙${fmt(k.cost)})`, () => Game.adoptCat(k.id)) }, locked ? `Lv.${k.lv}` : full ? '가득' : `🪙${fmt(k.cost)}`)));
        }
        lc.replaceChildren(...kids);
      }
    }
    const le = $('#live-expand');
    if (le) {
      const sig = JSON.stringify([s.W, s.H, s.level, s.open, s.money >= 0 && ['east', 'north'].map(d => Game.expandInfo(d).why)]);
      if (le.dataset.sig !== sig) {
        le.dataset.sig = sig;
        const plot = Game.plot;
        le.replaceChildren(h('div', { class: 'dim' }, `현재 ${s.W - 2}×${s.H - 2}칸 · 최대 ${plot.maxW - 2}×${plot.maxH - 2}칸`),
          ...[['east', '➡ 동쪽 +2열'], ['north', '⬆ 북쪽 +2행']].map(([d, label]) => {
            const inf = Game.expandInfo(d);
            return h('div', { class: 'srow' }, h('span', { class: 'mname' }, label),
              h('span', { class: 'dim' }, inf.room < inf.step ? '최대' : `→ ${inf.newW - 2}×${inf.newH - 2}`),
              h('button', { class: 'btn', disabled: !!inf.why, title: inf.why || '', onclick: () => this.confirm(`🏗 ${label}`, `가게가 ${inf.newW - 2}×${inf.newH - 2}칸으로 넓어집니다. 새 칸은 맨흙이에요.`, `공사 (🪙${fmt(inf.cost)})`, () => Game.expand(d)) }, inf.why && inf.why !== '돈 부족' ? inf.why : `🪙${fmt(inf.cost)}`));
          }));
      }
    }
    const cb = $('#coalBtn');
    if (cb) { cb.textContent = `구매 · 🪙${Game.coalPrice()}/${DATA.coal.pack}개`; cb.disabled = Game.hasEvent('coalStrike'); }
  },
  statusRow(ok, text) { return h('div', { class: 'srow2 ' + (ok ? 'ok' : 'no') }, (ok ? '✔ ' : '✘ ') + text); },

  renderBanner() {
    const s = Game.s, el = $('#banner'), kids = [];
    for (const e of s.events) {
      const ev = Game.EVENTS[e.id];
      const left = isFinite(e.until) ? ` (${Math.max(0, Math.ceil((e.until - s.min) / 60))}시간)` : '';
      kids.push(h('span', { class: 'ev' }, ev.name + left));
    }
    if (Game.hasEvent('pressure') || s.boiler.pressure > 75) kids.push(h('button', { class: 'btn danger', onclick: () => Game.ventValve() }, `🔴 안전밸브 개방 (압력 ${Math.round(s.boiler.pressure)})`));
    if (s.boiler.broken) kids.push(h('button', { class: 'btn danger', onclick: () => Game.repairBoiler() }, '🔧 보일러 수리 800'));
    if (s.leaks.length) kids.push(h('span', { class: 'ev bad' }, `💧 누수 ${s.leaks.length}곳`));
    if (s.stains.length >= 4) kids.push(h('span', { class: 'ev' }, `☕ 얼룩 ${s.stains.length}개`));
    if (!Game.boilerRunning() && s.objects.some(o => o.id === 'boiler') && s.coal <= 0) kids.push(h('span', { class: 'ev bad' }, '⚫ 석탄 없음'));
    const sig = kids.map(k => k.textContent).join('|');
    if (sig !== this._bannerSig) { el.replaceChildren(...kids); this._bannerSig = sig; }
    el.hidden = !kids.length;
  },

  // ───────── 캔버스 입력 ─────────
  bindCanvas() {
    const cv = $('#fx'), ptrs = new Map();
    let gesture = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      Render.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const t = Render.tileAt(e.clientX, e.clientY);
      this.state.hover = t;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        this.painting = false;
        return;
      }
      if (e.button === 1 || e.button === 2) { gesture = { kind: 'pan', x: e.clientX, y: e.clientY, moved: 0, right: e.button === 2 }; return; }
      const tool = this.state.tool;
      if (tool && (tool.kind === 'object' || tool.kind === 'move')) {
        // 미확정 자리를 잡고 끌면 그대로 따라오고, 다른 곳을 누르면 그 칸으로 옮긴다
        const dm = Game.dims(tool.id, tool.rot || 0);
        const inside = tool.px != null && t.x >= tool.px && t.x < tool.px + dm.w && t.y >= tool.py && t.y < tool.py + dm.h;
        gesture = { kind: 'place', ox: inside ? t.x - tool.px : 0, oy: inside ? t.y - tool.py : 0 };
        if (!inside && Game.inGrid(t.x, t.y)) { tool.px = t.x; tool.py = t.y; }
        this.syncToolbar();
      } else if (tool && (tool.kind === 'pipe' || tool.kind === 'erase')) {
        // 이미 고른 칸에서 시작하면 드래그로 빼고, 아니면 더한다
        const i = Game.inGrid(t.x, t.y) ? Game.idx(t.x, t.y) : -1;
        gesture = { kind: 'select', add: !tool.cells.has(i) };
        this.selectCell(t.x, t.y, gesture.add);
      } else if (tool) {
        const k = tool.kind;
        this.painting = ['floor', 'wall', 'ceil'].includes(k);
        gesture = { kind: 'paint' };
        this.applyTool(t.x, t.y, false);
      } else gesture = { kind: 'maybe', x: e.clientX, y: e.clientY, moved: 0, ev: e, t };
    });
    cv.addEventListener('pointermove', e => {
      const t = Render.tileAt(e.clientX, e.clientY);
      this.state.hover = t;
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gesture) return;
      if (gesture.kind === 'pinch' && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const r = cv.getBoundingClientRect();
        Render.pan(mx - gesture.mx, my - gesture.my);
        if (gesture.dist > 0) Render.zoomAt(d / gesture.dist, mx - r.left, my - r.top);
        gesture.dist = d; gesture.mx = mx; gesture.my = my;
      } else if (gesture.kind === 'pan' || gesture.kind === 'maybe') {
        const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
        gesture.moved += Math.abs(dx) + Math.abs(dy);
        if (gesture.kind === 'maybe' && gesture.moved > 6) gesture.kind = 'pan';
        if (gesture.kind === 'pan') Render.pan(dx, dy);
        gesture.x = e.clientX; gesture.y = e.clientY;
      } else if (gesture.kind === 'paint' && this.painting) this.applyTool(t.x, t.y, true);
      else if (gesture.kind === 'select') this.selectCell(t.x, t.y, gesture.add);
      else if (gesture.kind === 'place') {
        const tool = this.state.tool, nx = t.x - gesture.ox, ny = t.y - gesture.oy;
        if (tool && tool.px != null && Game.inGrid(nx, ny) && (nx !== tool.px || ny !== tool.py)) { tool.px = nx; tool.py = ny; this.syncToolbar(); }
      }
    });
    const end = e => {
      ptrs.delete(e.pointerId);
      if (!gesture) return;
      if (gesture.kind === 'maybe') this.clickSelect(gesture.t, gesture.ev);
      if (gesture.kind === 'pan' && gesture.right && gesture.moved < 6) this.cancelTool();
      if (gesture.kind === 'paint' && this.painting) { this.painting = false; Game.save(); this.syncToolbar(); }
      if (gesture.kind !== 'pinch' || ptrs.size === 0) gesture = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); gesture = null; this.painting = false; });
    cv.addEventListener('pointerleave', () => { this.state.hover = null; });
    
    $('#rotTool').addEventListener('click', () => this.rotateTool());
    $('#cancelTool').addEventListener('click', () => this.cancelTool());
    $('#okTool').addEventListener('click', () => this.confirmTool());
    $('#camShop').addEventListener('click', () => Render.fitShop());
    $('#camTown').addEventListener('click', () => Render.fitTown());
    $('#zoomIn').addEventListener('click', () => Render.zoomAt(1.25));
    $('#zoomOut').addEventListener('click', () => Render.zoomAt(0.8));
  },

  applyTool(x, y, dragging) {
    const t = this.state.tool; if (!t) return;
    if (!Game.inGrid(x, y)) return;
    const k = t.kind;
    if (k === 'floor' || k === 'wall' || k === 'ceil') Game.paint(k, x, y, t.id);
    else if (k === 'edit' && !dragging) {
      // 편집 도구: 클릭한 오브젝트를 들어 올린다 (천장 보기면 천장 오브젝트)
      const ceil = this.state.mode === 'interior' && this.state.sub === 'ceil';
      let o = Game.objAt(x, y, ceil ? 'ceil' : 'floor') || (!ceil && Game.inGrid(x, y + 1) && (() => { const b = Game.objAt(x, y + 1); return b && Sprites.object(b.id).tall >= 8 ? b : null; })());
      if (o) this.setTool({ kind: 'move', id: o.id, uid: o.uid, rot: o.rot || 0, px: o.x, py: o.y, fromEdit: true });
    }
    else if (k === 'remove' && !dragging) {
      const o = Game.objAt(x, y, this.state.sub === 'ceil' && this.state.mode === 'interior' ? 'ceil' : 'floor') || Game.objAt(x, y, 'ceil');
      if (o) { Game.removeObject(o); Game.save(); }
    }
  },

  // 배관 도구: 칸을 미확정 목록에 넣거나 뺀다
  selectCell(x, y, add) {
    const t = this.state.tool;
    if (!t || !t.cells || !Game.isInterior(x, y)) return;
    const i = Game.idx(x, y);
    if (add) {
      const has = t.kind === 'pipe' ? Game.s.pipe[t.type][i] : ['cold', 'hot', 'heat'].some(k => Game.s.pipe[k][i]);
      if (t.kind === 'pipe' ? has : !has) return;
      t.cells.add(i);
    } else t.cells.delete(i);
    this.syncToolbar();
  },

  clickSelect(t, e) {
    this.closePopup();
    const s = Game.s;
    const stain = Game.inGrid(t.x, t.y) && Game.stainAt(t.x, t.y);
    if (stain) { Game.wipeStain(stain); return; }
    if (Game.inGrid(t.x, t.y)) {
      const i = Game.idx(t.x, t.y), leak = s.leaks.find(l => l.i === i);
      if (leak) return this.popup(e, h('div', {}, h('b', {}, `💧 ${DATA.pipes[leak.type].name} 누수`), h('p', {}, '새는 배관 때문에 이 칸 너머로 흐름이 끊겼습니다.'), h('button', { class: 'btn', onclick: () => { Game.repairLeak(leak.type, i); this.closePopup(); } }, '수리 🪙40')));
    }
    const crew = Game.inGrid(t.x, t.y) && Game.crewAt(t.x, t.y);
    if (crew) {
      const c = crew.ref, d = DATA.staff[c.kind];
      const doing = d.robot && !Game.boilerRunning() ? '증기 부족 — 정지' : crew.task ? { serve: '서빙하러 가는 중', collect: '완성품 가지러 가는 중', cook: '메뉴 만들러 가는 중', wipe: '얼룩 닦으러 가는 중', boiler: '보일러 손보러 가는 중', leak: '누수 고치러 가는 중' }[crew.task.k] : crew.cast > 0 ? '일하는 중' : '대기 중';
      return this.popup(e, h('div', {}, h('b', {}, `${d.icon} ${c.name}`), h('p', { class: 'dim' }, `${d.name} · ${d.robot ? `석탄 ${d.coal}/일` : `일급 🪙${d.wage}`} · ${doing}`),
        h('button', { class: 'btn ghost', onclick: () => { this.closePopup(); this.confirm(`${c.name} 내보내기`, `${d.name} ${c.name}을(를) 내보낼까요?`, '내보내기', () => Game.fire(c.uid)); } }, '해고')));
    }
    const cat = Game.catAt(t.x, t.y);
    if (cat) {
      const k = DATA.cats.find(c => c.id === cat.ref.kind);
      const where = cat.path.length ? '어슬렁거리는 중' : cat.state === 'nap' ? (Game.rt.nets.heatCover.has(Game.idx(Math.round(cat.x), Math.round(cat.y))) ? '따뜻한 바닥에서 낮잠 중' : '낮잠 중') : '앉아서 구경 중';
      return this.popup(e, h('div', {}, h('b', {}, `🐈 ${cat.ref.name}`), h('p', { class: 'dim' }, `${k.name} · ${k.kg}kg · ${where}`),
        h('p', {}, `현열 ${k.sens}W · 잠열 ${k.lat}W`), h('p', { class: 'dim' }, `분위기 +${DATA.catAppeal} · 2칸 안의 손님 만족도 +6`)));
    }
    let o = Game.objAt(t.x, t.y);
    if (!o && Game.inGrid(t.x, t.y + 1)) { const below = Game.objAt(t.x, t.y + 1); if (below && Sprites.object(below.id).tall >= 8) o = below; }
    if (!o) return;
    if (o.cook && o.cook.done) { Game.collect(o); return; }
    this.openObjectPopup(o, e);
  },

  openObjectPopup(o, e) {
    const d = DATA.objects[o.id], s = Game.s;
    const box = h('div', {});
    box.append(h('b', {}, d.name));
    if (d.desc) box.append(h('p', { class: 'dim' }, d.desc));
    if (d.needs && d.needs.length) {
      const nm = { cold: '급수', hot: '증기', heat: '난방' }, miss = Game.missingNeeds(o);
      box.append(this.statusRow(Game.working(o), Game.working(o) ? '작동 중' : (miss.length ? miss.map(m => nm[m]).join(', ') + ' 배관 미연결' : '보일러가 꺼져 있음')));
    }
    if (o.id === 'boiler') {
      const live = h('div', { class: 'gauge' });
      const upd = () => live.replaceChildren(h('span', {}, '압력'), h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, s.boiler.pressure)}%;background:${s.boiler.pressure > 80 ? '#d1584f' : '#6aa84f'}` })), h('span', {}, Math.round(s.boiler.pressure)));
      upd(); this._popupTimer = setInterval(upd, 200);
      box.append(live, h('div', {}, `석탄 ${Math.floor(s.coal)}`));
      box.append(h('button', { class: 'btn danger', onclick: () => Game.ventValve() }, '🔴 안전밸브 개방'));
      if (s.boiler.broken) box.append(h('button', { class: 'btn', onclick: () => { Game.repairBoiler(); this.closePopup(); } }, '🔧 수리 🪙800'));
    }
    if (d.cook) {
      if (o.cook) box.append(h('p', {}, `${DATA.recipes[o.cook.rid].name} 조리 중… ${Math.floor(o.cook.t)}/${o.cook.total}분`));
      else {
        const list = h('div', { class: 'recipes' });
        for (const [rid, r] of Object.entries(DATA.recipes)) {
          if (r.eq !== o.id) continue;
          const why = Game.canCook(o, rid);
          const uses = Object.entries(r.use).map(([k, v]) => DATA.ingredients[k].icon + v).join(' ');
          list.append(h('button', { class: 'rbtn', disabled: !!why, onclick: () => { if (Game.startCook(o, rid)) this.closePopup(); } },
            Sprites.thumb('icon', rid, 18), h('span', { class: 'mname' }, r.name),
            h('span', { class: 'dim' }, why || `${uses} · ${r.time}분 · ×${r.yield}`)));
        }
        box.append(list);
      }
    }
    box.append(h('div', { class: 'dim' }, `분위기 +${d.appeal}`));
    if (d.light) box.append(h('div', { class: 'dim' }, `💡 조명 반경 ${d.light}칸`));
    // 편집: 옮기기 · 좌우 뒤집기 · 철거
    box.append(h('div', { class: 'editrow' },
      h('button', { class: 'btn', onclick: () => { this.closePopup(); this.setTool({ kind: 'move', id: o.id, uid: o.uid, rot: o.rot || 0, px: o.x, py: o.y }); } }, '✥ 옮기기'),
      Game.canRotate(o.id) ? h('button', { class: 'btn', onclick: () => { Game.rotateObject(o); } }, '⟳ 회전') : null,
      h('button', { class: 'btn', onclick: () => { Game.flipObject(o); } }, '⇋ 뒤집기'),
      h('button', { class: 'btn ghost', onclick: () => { Game.removeObject(o); Game.save(); this.closePopup(); } }, `철거 (+${fmt(d.cost / 2)})`)));
    this.popup(e, box);
  },

  popup(e, content) {
    const el = $('#popup');
    el.replaceChildren(h('button', { class: 'x', onclick: () => this.closePopup() }, '✕'), content);
    el.hidden = false;
    const r = $('#stage').getBoundingClientRect();
    const pw = Math.min(280, r.width - 16);
    el.style.width = pw + 'px';
    let x = e.clientX - r.left + 12, y = e.clientY - r.top + 12;
    if (x + pw > r.width) x = Math.max(8, e.clientX - r.left - pw - 12);
    el.style.left = x + 'px'; el.style.top = Math.max(8, Math.min(y, r.height - el.offsetHeight - 8)) + 'px';
  },
  closePopup() { const el = $('#popup'); el.hidden = true; clearInterval(this._popupTimer); },

  toast(msg, kind = 'info') {
    const el = h('div', { class: 'toast ' + kind }, msg);
    $('#toasts').append(el);
    setTimeout(() => el.classList.add('out'), kind === 'warn' || kind === 'bad' ? 4500 : 2800);
    setTimeout(() => el.remove(), 5200);
    const all = $('#toasts').children; if (all.length > 4) all[0].remove();
  },

  modal(content) {
    const m = $('#modal'); m.replaceChildren(h('div', { class: 'mbox' }, content)); m.hidden = false;
  },
  closeModal() { $('#modal').hidden = true; },
  // 단순 확인창
  confirm(title, text, okLabel, onOk) {
    this.modal(h('div', { class: 'buybox' }, h('h2', {}, title), h('p', {}, text),
      h('div', { class: 'buybtns' },
        h('button', { class: 'btn ghost', onclick: () => this.closeModal() }, '취소'),
        h('button', { class: 'btn big', onclick: () => { this.closeModal(); onOk(); this.refreshLive(); } }, okLabel))));
  },
  // 재료·석탄 구매 확인창: 개수(묶음) 조절
  showBuy(kind) {
    const coal = kind === 'coal', ing = coal ? null : DATA.ingredients[kind];
    const name = coal ? '석탄' : ing.name, icon = coal ? '⚫' : ing.icon, pack = coal ? DATA.coal.pack : ing.pack;
    const price = () => coal ? Game.coalPrice() : ing.price;
    const have = () => coal ? Math.floor(Game.s.coal) : Game.s.stock[kind];
    const max = () => Math.max(1, Math.min(99, Math.floor(Game.s.money / price())));
    let qty = 1;
    const qEl = h('input', { class: 'qty', type: 'number', min: 1, max: 99, value: 1, inputmode: 'numeric' });
    const info = h('div', { class: 'buyinfo' }), okBtn = h('button', { class: 'btn big' }, '');
    const sync = () => {
      qty = Math.max(1, Math.min(99, Math.floor(+qEl.value || 1)));
      if (+qEl.value !== qty) qEl.value = qty;
      const total = price() * qty, short = total > Game.s.money;
      info.replaceChildren(...[
        h('div', {}, `보유 ${fmt(have())}개 → `, h('b', {}, `${fmt(have() + pack * qty)}개`), h('span', { class: 'dim' }, ` (+${fmt(pack * qty)})`)),
        h('div', {}, `합계 `, h('b', { class: short ? 'bad' : '' }, `🪙${fmt(total)}`), h('span', { class: 'dim' }, ` · 남는 돈 🪙${fmt(Game.s.money - total)}`)),
        short ? h('div', { class: 'bad' }, '돈이 모자라요') : null].filter(Boolean));
      okBtn.textContent = `구매 (🪙${fmt(total)})`;
      okBtn.disabled = short;
    };
    const step = d => () => { qEl.value = Math.max(1, Math.min(99, qty + d)); sync(); };
    qEl.addEventListener('input', sync);
    qEl.addEventListener('keydown', e => { if (e.key === 'Enter') okBtn.click(); });
    okBtn.addEventListener('click', () => { if (Game.buy(kind, qty)) { this.closeModal(); this.toast(`${icon} ${name} ${fmt(pack * qty)}개 구매 (🪙${fmt(price() * qty)})`, 'good'); this.refreshLive(); } else sync(); });
    this.modal(h('div', { class: 'buybox' },
      h('h2', {}, `${icon} ${name} 구매`),
      h('p', { class: 'dim' }, `1묶음 = ${pack}개 · 🪙${fmt(price())}`),
      h('div', { class: 'stepper' },
        h('button', { class: 'btn ghost', onclick: step(-10) }, '−10'),
        h('button', { class: 'btn ghost', onclick: step(-1) }, '−'),
        qEl, h('span', { class: 'dim' }, '묶음'),
        h('button', { class: 'btn ghost', onclick: step(1) }, '＋'),
        h('button', { class: 'btn ghost', onclick: step(10) }, '+10'),
        h('button', { class: 'btn ghost', onclick: () => { qEl.value = max(); sync(); } }, '최대')),
      info,
      h('div', { class: 'buybtns' }, h('button', { class: 'btn ghost', onclick: () => this.closeModal() }, '취소'), okBtn)));
    sync();
  },

  showTitle() {
    App.onTitle = true;
    const box = h('div', { class: 'title' },
      h('h1', {}, '⚙ 스팀 & 빈즈 ⚙'), h('p', { class: 'dim' }, '증기 도시 한복판, 빈 땅 한 필지에서 시작하는 카페 타이쿤'),
      Game.hasSave() ? h('button', { class: 'btn big', onclick: () => { App.autoFullscreen(); if (Game.load()) { this.closeModal(); App.start(); } } }, '이어하기') : null,
      h('button', { class: 'btn big', onclick: () => { App.autoFullscreen(); this.showPlots(); } }, '새 게임'),
      App.isMobile() && !App.isStandalone() && App.isIOS() ? h('p', { class: 'dim fs-hint' }, '📱 아이폰은 사파리 공유 버튼 → [홈 화면에 추가] 로 설치하면 전체화면으로 실행돼요') : null,
      App.isMobile() && !App.isStandalone() && !App.isIOS() ? h('p', { class: 'dim fs-hint' }, '📱 게임을 시작하면 전체화면으로 바뀌어요 · 브라우저 메뉴 → [홈 화면에 추가] 하면 앱처럼 실행') : null);
    this.modal(box);
  },
  showPlots() {
    App.onTitle = true;
    const box = h('div', {}, h('h2', {}, '어느 땅을 살까요?'), h('p', { class: 'dim' }, `시작 자금 🪙${fmt(DATA.startMoney)}`));
    for (const p of DATA.plots) {
      box.append(h('button', { class: 'plot', onclick: () => this.showHeroes(p.id) },
        h('b', {}, p.name), h('span', {}, `${p.w - 2}×${p.h - 2}칸 · 유동인구 ×${p.traffic} · 🪙${fmt(p.price)}`), h('span', { class: 'dim' }, p.desc)));
    }
    box.append(h('button', { class: 'btn ghost', onclick: () => this.showTitle() }, '뒤로'));
    this.modal(box);
  },
  showHeroes(plotId) {
    const box = h('div', {}, h('h2', {}, '주인공을 골라 주세요'), h('p', { class: 'dim' }, '카페 주인 겸 바리스타입니다.'));
    const row = h('div', { class: 'heroes' });
    for (const hr of DATA.heroes) {
      const pic = Sprites.hasChar(hr.id) ? Sprites.thumb('char', hr.id, 64) : Sprites.thumb('player', 0, 64);
      row.append(h('button', { class: 'plot hero', onclick: () => { Game.wipe(); Game.newGame(plotId, hr.id); this.closeModal(); App.start(); this.showIntro(); } }, pic, h('b', {}, hr.name)));
    }
    box.append(row, h('button', { class: 'btn ghost', onclick: () => this.showPlots() }, '뒤로'));
    this.modal(box);
  },
  showIntro() {
    this.modal(h('div', {},
      h('h2', {}, '땅을 샀습니다!'),
      h('ol', { class: 'steps' },
        h('li', {}, '🔧 설비 탭: 중앙 보일러를 놓고, 왼쪽 벽 수도 인입구에서 보일러까지 급수관을 잇습니다.'),
        h('li', {}, '보일러에서 급탕(증기)관을 뻗어 에스프레소 머신·싱크대로, 난방관은 바닥 곳곳에 깝니다.'),
        h('li', {}, '🎨 인테리어 탭: 바닥재를 깔고(가구는 바닥재 위에만) 카운터·싱크대·머신·테이블·의자를 배치합니다.'),
        h('li', {}, '☕ 운영 탭 체크리스트를 다 채우면 영업 시작! 설비를 클릭해 메뉴를 만드세요.'),
        h('li', {}, '❄ 눈보라, 보일러 과압, 배관 누수 같은 사고에 대비하세요.')),
      h('button', { class: 'btn big', onclick: () => { this.closeModal(); Tutorial.restart(); } }, '시작하기')));
  },
  showDayEnd(sum) {
    const profit = sum.endMoney - sum.startMoney;
    this.modal(h('div', {},
      h('h2', {}, `${sum.day}일차 영업 종료`),
      h('table', { class: 'sum' },
        ...[['손님', `${sum.served}명`], ['화난 손님', `${sum.angry}명`], ['매출', fmt(sum.revenue)], ['팁', fmt(sum.tips)], ['지출', fmt(sum.spent)], ['석탄 사용', Math.round(sum.coalUsed)], ...(sum.catFood ? [['고양이 사료', fmt(sum.catFood)]] : []), ...(sum.wages ? [['직원 급여', fmt(sum.wages)]] : []), ...(sum.robotCoal ? [['로봇 석탄', Math.round(sum.robotCoal)]] : []), ...(sum.loanPaid ? [['대출 상환', fmt(sum.loanPaid)]] : []), ...(sum.debt ? [['남은 빚', fmt(sum.debt)]] : []), ['순이익', (profit >= 0 ? '+' : '') + fmt(profit)]]
          .map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))),
      h('p', { class: 'dim' }, `내일 날씨: ${Game.weather().icon} ${Game.weather().name} (${Game.weather().temp}°)`),
      h('button', { class: 'btn big', onclick: () => this.closeModal() }, Game.s.auto ? '다음 날 준비 (자동 운영: 곧 넘어갑니다)' : '다음 날 준비')));
    // 자동 운영 중이면 정산 화면을 잠깐 보여 주고 다음 날로
    if (Game.s.auto) { const box = $('#modal').firstChild; setTimeout(() => { if ($('#modal').firstChild === box) this.closeModal(); }, 6000); }
  },
  // 계정(클라우드 저장) — 상단바 대신 메뉴에서만 보여 준다
  accountSection() {
    if (typeof FB_OK === 'undefined' || !FB_OK) return null;
    const user = typeof currentUser !== 'undefined' ? currentUser : null;
    return h('div', { class: 'account' },
      h('h3', {}, '☁️ 계정'),
      user ? h('p', { class: 'dim' }, `${user.email} · 진행이 클라우드에 저장돼요`) : h('p', { class: 'dim' }, '로그인하면 진행이 클라우드에 저장되고 다른 기기에서 이어할 수 있어요'),
      user ? h('button', { class: 'btn big', onclick: () => { this.closeModal(); logoutAccount(); } }, '로그아웃')
        : h('button', { class: 'btn big', onclick: () => { this.closeModal(); openAuthModal(); } }, '🔒 로그인 / 회원가입'));
  },
  // 볼륨 슬라이더 한 줄
  volRow(label, value, onInput) {
    const out = h('span', { class: 'vval' }, Math.round(value * 100) + '');
    const r = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(value * 100) });
    r.addEventListener('input', () => { out.textContent = r.value; onInput(r.value / 100); });
    return h('label', { class: 'vrow' }, h('span', { class: 'vname' }, label), r, out);
  },
  showSystemMenu() {
    this.modal(h('div', {},
      h('div', { class: 'mhead' }, h('h2', {}, '메뉴'), h('button', { class: 'btn mclose', onclick: () => this.closeModal() }, '✕ 닫기')),
      h('h3', {}, '🔊 소리'),
      this.volRow('음악', BGM.vol, v => BGM.setVol(v)),
      this.volRow('효과음', SFX.vol, v => SFX.setVol(v)),
      this.volRow('증기·환경음', SFX.envVol, v => SFX.setEnvVol(v)),
      h('button', { class: 'btn big', onclick: () => { Game.save(); this.toast('저장했습니다'); this.closeModal(); } }, '저장'),
      h('button', { class: 'btn big', onclick: () => this.modal(h('div', {},
        h('h2', {}, '처음부터 시작할까요?'), h('p', {}, '지금 카페의 진행 상황이 모두 지워집니다.'),
        h('button', { class: 'btn big danger', onclick: () => { Game.wipe(); this.showPlots(); } }, '지우고 새로 시작'),
        h('button', { class: 'btn ghost', onclick: () => this.showSystemMenu() }, '취소'))) }, '처음부터'),
      this.accountSection(),
      h('h3', {}, '난이도'),
      h('div', { class: 'diffs' }, Object.entries(DATA.difficulty).map(([k, d]) =>
        h('button', { class: 'btn diff' + (Game.s && Game.s.difficulty === k ? ' on' : ''), onclick: () => { Game.setDifficulty(k); this.showSystemMenu(); } },
          h('b', {}, d.name), h('span', { class: 'dim' }, d.desc)))),
      h('button', { class: 'btn big', onclick: () => { Game.setAuto(!Game.s.auto); this.showSystemMenu(); } }, Game.s && Game.s.auto ? '🤖 자동 운영 끄기' : '🤖 자동 운영 켜기'),
      h('button', { class: 'btn big', onclick: () => { SFX.toggle(); this.showSystemMenu(); } }, SFX.muted ? '🔇 효과음 켜기' : '🔊 효과음 끄기'),
      App.canFullscreen() && !App.isStandalone() ? h('button', { class: 'btn big', onclick: () => { App.toggleFullscreen(); this.closeModal(); } }, App.isFullscreen() ? '⛶ 전체화면 끄기' : '⛶ 전체화면') : null,
      App.isIOS() && !App.isStandalone() ? h('p', { class: 'dim fs-hint' }, '아이폰 전체화면: 사파리 공유 → [홈 화면에 추가]') : null,
      h('button', { class: 'btn big', onclick: () => { this.closeModal(); Tutorial.restart(); } }, '🎓 튜토리얼 다시 보기'),
      h('details', {}, h('summary', {}, '디버그: 이벤트 발생'), h('div', { class: 'chips' }, Object.entries(Game.EVENTS).map(([id, ev]) => h('button', { class: 'btn', onclick: () => { Game.triggerEvent(id); this.closeModal(); } }, ev.name)))),
      h('button', { class: 'btn ghost', onclick: () => this.closeModal() }, '닫기')));
  },
};
