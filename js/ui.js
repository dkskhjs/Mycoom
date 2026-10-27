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

const UI = {
  state: { mode: 'utility', sub: 'floor', tool: null, hover: null },
  painting: false,

  init() {
    this.tabs = $('#tabs'); this.body = $('#panelBody');
    this.tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      this.setMode(b.dataset.tab);
    });
    $('#speed').addEventListener('click', e => {
      const b = e.target.closest('[data-speed]'); if (!b) return;
      const v = +b.dataset.speed;
      Game.paused = v === 0; if (v) Game.speed = v;
      this.syncSpeed();
    });
    $('#openBtn').addEventListener('click', () => { Game.s.open ? null : Game.openCafe(); this.refresh(); });
    $('#menuBtn').addEventListener('click', () => this.showSystemMenu());
    this.bindCanvas();
    Game.on('toast', (m, k) => this.toast(m, k));
    Game.on('built', () => this.refreshLive());
    Game.on('levelUp', () => this.refresh());
    Game.on('dayEnd', s => { this.refresh(); this.showDayEnd(s); });
    Game.on('opened', () => this.refresh());
    Game.on('expanded', () => { Render.flakes = []; Render.resize($('#canvasWrap')); this.refresh(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.setTool(null); this.closePopup(); }
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

  setMode(mode) {
    this.state.mode = mode; this.setTool(null); this.closePopup();
    document.querySelectorAll('#tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === mode));
    this.refresh();
  },
  setTool(tool) {
    this.state.tool = tool;
    document.querySelectorAll('.card[data-key]').forEach(c => c.classList.toggle('sel', !!tool && c.dataset.key === this.toolKey(tool)));
    $('#toolHint').textContent = tool ? `${this.toolName(tool)} — 맵을 클릭/드래그 · ESC/우클릭 취소` : '오브젝트를 클릭해서 사용 · 도구를 골라 건설';
    $('#cancelTool').hidden = !tool;
  },
  toolKey(t) { return t.kind + ':' + (t.id || t.type || ''); },
  toolName(t) {
    if (t.kind === 'object') return DATA.objects[t.id].name;
    if (t.kind === 'pipe') return DATA.pipes[t.type].name + ' 깔기';
    if (t.kind === 'erase') return '배관 철거';
    if (t.kind === 'remove') return '오브젝트 철거';
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
    grid.append(this.card({ key: 'remove:', thumb: this.textThumb('⚒', '#ffb070'), name: '오브젝트 철거', cost: 0, lines: ['50% 환급'], onClick: () => this.setTool({ kind: 'remove' }) }));
    B.append(grid);
    B.append(h('h3', {}, '설비 상태'), h('div', { id: 'live-util', class: 'live' }));
  },

  renderInterior() {
    const B = this.body, sub = this.state.sub;
    const subs = [['floor', '바닥'], ['wall', '벽'], ['ceil', '천장'], ['kitchen', '주방'], ['furniture', '가구'], ['decor', '장식']];
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
      if (d.cat !== cat) continue;
      grid.append(this.card({ key: 'object:' + id, thumb: Sprites.thumb('obj', id, 40), name: d.name, cost: d.cost, lv: d.lv, lines: [`분위기 +${d.appeal}`, this.needsText(d)].filter(Boolean), onClick: () => this.setTool({ kind: 'object', id }) }));
    }
    if (!matTable || sub === 'ceil') grid.append(this.card({ key: 'remove:', thumb: this.textThumb('⚒', '#ffb070'), name: '철거', cost: 0, lines: ['50% 환급'], onClick: () => this.setTool({ kind: 'remove' }) }));
    B.append(grid);
    const tips = {
      floor: '바닥재 위에만 가구를 놓을 수 있어요. 드래그해서 칠하세요.',
      wall: '바깥 테두리 벽에 칠합니다. 스테인드글라스 창은 분위기가 높아요.',
      ceil: '천장 보기 상태입니다. 천장 마감과 조명은 저녁 분위기를 좌우해요.',
      kitchen: '조리 설비는 증기 배관이 연결돼야 작동합니다. 카운터에 완성품이 진열됩니다.',
      furniture: '의자는 테이블과 상하좌우로 붙어 있어야 좌석이 됩니다.',
      decor: '장식은 분위기 점수를 올려 손님과 팁을 늘려줍니다.',
    };
    B.append(h('p', { class: 'tip' }, tips[sub]));
    B.append(h('div', { id: 'live-appeal', class: 'live' }));
  },

  renderOps() {
    const B = this.body;
    B.append(h('div', { id: 'live-ops', class: 'live' }));
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
        h('button', { class: 'btn', onclick: () => { Game.buy(id); this.refreshLive(); } }, `+${ing.pack} · 🪙${ing.price}`)));
    }
    list.append(h('div', { class: 'srow' },
      h('span', { class: 'sicon' }, '⚫'), h('span', { class: 'mname' }, '석탄'),
      h('span', { class: 'dim', 'data-stock': 'coal' }, ''),
      h('button', { class: 'btn', id: 'coalBtn', onclick: () => { Game.buy('coal'); this.refreshLive(); } }, '')));
    B.append(list);
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
    const ob = $('#openBtn');
    ob.textContent = s.open ? '영업 중…' : '☕ 영업 시작';
    ob.disabled = s.open; ob.classList.toggle('ready', !s.open && Game.canOpen());

    // 이벤트 배너
    this.renderBanner();

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
    if (la) la.replaceChildren(h('div', {}, `분위기 점수 ${n.density.toFixed(1)}  (총 ${Math.round(n.appeal)} / ${n.interior}칸)`), h('div', { class: 'dim' }, `좌석 ${n.seats.length}개`));
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
      kids.push(h('div', { class: 'dim' }, `현재 손님 ${Game.rt.customers.filter(c => c.state !== 'pass').length} · 분위기 ${n.density.toFixed(1)} · 평판 ${s.rep.toFixed(0)}`));
      lo.replaceChildren(...kids);
    }
    document.querySelectorAll('[data-stock]').forEach(el => {
      const k = el.dataset.stock;
      el.textContent = k === 'coal' ? `보유 ${Math.floor(s.coal)}` : `보유 ${s.stock[k]}`;
    });
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
            h('button', { class: 'btn', disabled: locked || full, onclick: () => Game.adoptCat(k.id) }, locked ? `Lv.${k.lv}` : full ? '가득' : `🪙${fmt(k.cost)}`)));
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
              h('button', { class: 'btn', disabled: !!inf.why, title: inf.why || '', onclick: () => {
                if (confirm(`${label} 확장 공사 (🪙${fmt(inf.cost)})를 진행할까요?`)) Game.expand(d);
              } }, inf.why && inf.why !== '돈 부족' ? inf.why : `🪙${fmt(inf.cost)}`));
          }));
      }
    }
    const cb = $('#coalBtn');
    if (cb) { cb.textContent = `+${DATA.coal.pack} · 🪙${Math.round(DATA.coal.price * s.coalPriceMul)}`; cb.disabled = Game.hasEvent('coalStrike'); }
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
    if (!Game.boilerRunning() && s.objects.some(o => o.id === 'boiler') && s.coal <= 0) kids.push(h('span', { class: 'ev bad' }, '⚫ 석탄 없음'));
    const sig = kids.map(k => k.textContent).join('|');
    if (sig !== this._bannerSig) { el.replaceChildren(...kids); this._bannerSig = sig; }
    el.hidden = !kids.length;
  },

  // ───────── 캔버스 입력 ─────────
  // 입력: 도구가 있으면 칠하기/설치, 없으면 드래그=카메라 이동 · 클릭=선택
  // 휠/핀치=확대축소, 우클릭·가운데 드래그=항상 이동
  bindCanvas() {
    const cv = $('#fx'), ptrs = new Map();
    let gesture = null; // { kind: 'pan'|'maybe'|'paint'|'pinch', ... }
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
        // 핀치 시작: 칠하던 건 멈춘다
        const [a, b] = [...ptrs.values()];
        gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        this.painting = false;
        return;
      }
      if (e.button === 1 || e.button === 2) { gesture = { kind: 'pan', x: e.clientX, y: e.clientY, moved: 0, right: e.button === 2 }; return; }
      if (this.state.tool) {
        const k = this.state.tool.kind;
        this.painting = ['floor', 'wall', 'ceil', 'pipe', 'erase'].includes(k);
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
    });
    const end = e => {
      ptrs.delete(e.pointerId);
      if (!gesture) return;
      if (gesture.kind === 'maybe') this.clickSelect(gesture.t, gesture.ev);
      if (gesture.kind === 'pan' && gesture.right && gesture.moved < 6) this.setTool(null);
      if (gesture.kind === 'paint' && this.painting) { this.painting = false; Game.save(); }
      if (gesture.kind !== 'pinch' || ptrs.size === 0) gesture = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); gesture = null; this.painting = false; });
    cv.addEventListener('pointerleave', () => { this.state.hover = null; });
    // 카메라 버튼
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
    else if (k === 'pipe') Game.placePipe(t.type, x, y);
    else if (k === 'erase') Game.erasePipe(x, y);
    else if (k === 'object' && !dragging) { if (Game.placeObject(t.id, x, y)) { Game.save(); if (DATA.objects[t.id].unique) this.setTool(null); } }
    else if (k === 'remove' && !dragging) {
      const o = Game.objAt(x, y, this.state.sub === 'ceil' && this.state.mode === 'interior' ? 'ceil' : 'floor') || Game.objAt(x, y, 'ceil');
      if (o) { Game.removeObject(o); Game.save(); }
    }
  },

  clickSelect(t, e) {
    this.closePopup();
    const s = Game.s;
    // 누수 칸
    if (Game.inGrid(t.x, t.y)) {
      const i = Game.idx(t.x, t.y), leak = s.leaks.find(l => l.i === i);
      if (leak) return this.popup(e, h('div', {}, h('b', {}, `💧 ${DATA.pipes[leak.type].name} 누수`), h('p', {}, '새는 배관 때문에 이 칸 너머로 흐름이 끊겼습니다.'), h('button', { class: 'btn', onclick: () => { Game.repairLeak(leak.type, i); this.closePopup(); } }, '수리 🪙40')));
    }
    const cat = Game.catAt(t.x, t.y);
    if (cat) {
      const k = DATA.cats.find(c => c.id === cat.ref.kind);
      const where = cat.path.length ? '어슬렁거리는 중' : cat.state === 'nap' ? (Game.rt.nets.heatCover.has(Game.idx(Math.round(cat.x), Math.round(cat.y))) ? '따뜻한 바닥에서 낮잠 중' : '낮잠 중') : '앉아서 구경 중';
      return this.popup(e, h('div', {}, h('b', {}, `🐈 ${cat.ref.name}`), h('p', { class: 'dim' }, `${k.name} · ${k.kg}kg · ${where}`),
        h('p', {}, `현열 ${k.sens}W · 잠열 ${k.lat}W`), h('p', { class: 'dim' }, `분위기 +${DATA.catAppeal} · 2칸 안의 손님 만족도 +6`)));
    }
    // 오브젝트 (키 큰 스프라이트는 윗칸 클릭도 인정)
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
    box.append(h('button', { class: 'btn ghost', onclick: () => { Game.removeObject(o); Game.save(); this.closePopup(); } }, `철거 (+${fmt(d.cost / 2)})`));
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

  showTitle() {
    App.onTitle = true;
    const box = h('div', { class: 'title' },
      h('h1', {}, '⚙ 스팀 & 빈즈 ⚙'), h('p', { class: 'dim' }, '증기 도시 한복판, 빈 땅 한 필지에서 시작하는 카페 타이쿤'),
      Game.hasSave() ? h('button', { class: 'btn big', onclick: () => { if (Game.load()) { this.closeModal(); App.start(); } } }, '이어하기') : null,
      h('button', { class: 'btn big', onclick: () => this.showPlots() }, '새 게임'));
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
      h('button', { class: 'btn big', onclick: () => this.closeModal() }, '시작하기')));
  },
  showDayEnd(sum) {
    const profit = sum.endMoney - sum.startMoney;
    this.modal(h('div', {},
      h('h2', {}, `${sum.day}일차 영업 종료`),
      h('table', { class: 'sum' },
        ...[['손님', `${sum.served}명`], ['화난 손님', `${sum.angry}명`], ['매출', fmt(sum.revenue)], ['팁', fmt(sum.tips)], ['지출', fmt(sum.spent)], ['석탄 사용', Math.round(sum.coalUsed)], ...(sum.catFood ? [['고양이 사료', fmt(sum.catFood)]] : []), ['순이익', (profit >= 0 ? '+' : '') + fmt(profit)]]
          .map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))),
      h('p', { class: 'dim' }, `내일 날씨: ${Game.weather().icon} ${Game.weather().name} (${Game.weather().temp}°)`),
      h('button', { class: 'btn big', onclick: () => this.closeModal() }, '다음 날 준비')));
  },
  showSystemMenu() {
    this.modal(h('div', {},
      h('h2', {}, '메뉴'),
      h('button', { class: 'btn big', onclick: () => { Game.save(); this.toast('저장했습니다'); this.closeModal(); } }, '저장'),
      h('button', { class: 'btn big', onclick: () => { if (confirm('진행 상황을 지우고 처음부터 시작할까요?')) { Game.wipe(); this.showPlots(); } } }, '처음부터'),
      h('details', {}, h('summary', {}, '디버그: 이벤트 발생'), h('div', { class: 'chips' }, Object.entries(Game.EVENTS).map(([id, ev]) => h('button', { class: 'btn', onclick: () => { Game.triggerEvent(id); this.closeModal(); } }, ev.name)))),
      h('button', { class: 'btn ghost', onclick: () => this.closeModal() }, '닫기')));
  },
};
