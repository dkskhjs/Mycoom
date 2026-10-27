// 가게 주변 스팀펑크 마을 풍경 — 필지 바깥 여백에 그리는 정적 배경 + 약간의 애니메이션
// 좌표는 게임 격자(가게 좌상단 = 0,0) 기준. 여백 때문에 음수 좌표도 쓴다.
const TOWN = { mx: 12, mt: 18, mb: 9 };
// 원경 그림이 끝나고 코드로 그린 거리가 시작하는 줄 (가게 위쪽으로 몇 칸)
const VISTA_GROUND = 4;

const Town = {
  bg: null, key: '', chimneys: [], windows: [], ship: null, boat: null,

  // 여백까지 포함한 장면 크기 (px)
  sceneW() { return (Game.s.W + TOWN.mx * 2) * TILE; },
  sceneH() { return (TOWN.mt + Game.s.H + STREET_ROWS + TOWN.mb) * TILE; },
  ox() { return TOWN.mx * TILE; },
  oy() { return TOWN.mt * TILE; },

  // 시드 고정 난수 (필지마다 같은 마을)
  rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },

  ensure() {
    const s = Game.s, snowy = s.weather === 'snow' || Game.hasEvent('blizzard');
    const key = [s.W, s.H, s.plotId, snowy].join(',');
    if (key === this.key && this.bg) return;
    this.key = key;
    this.build(snowy);
  },

  build(snowy) {
    const s = Game.s, W = s.W, H = s.H, SW = this.sceneW(), SH = this.sceneH();
    const [c, g] = makeCanvas(SW, SH);
    g.translate(this.ox(), this.oy());
    // 눈 위에 그려야 하는 것(떠 있는 비행선, 탑 등)은 별도 앞 레이어
    const [fc, fgc] = makeCanvas(SW, SH); fgc.translate(this.ox(), this.oy());
    this.front = fc; this.FP = pen(fgc); this.fgc = fgc;
    const P = pen(g), R = this.rng([...s.plotId].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    this.chimneys = []; this.windows = [];
    this.covered = new Set();
    const cover = (x0_, y0_, w_, h_) => { for (let y = y0_; y < y0_ + h_; y++) for (let x = x0_; x < x0_ + w_; x++) this.covered.add(x + ',' + y); };
    this.cover = cover;
    const x0 = -TOWN.mx, x1 = W + TOWN.mx, yStreet = H, yBot = H + STREET_ROWS + TOWN.mb;
    const vista = this.vistaImage(snowy);
    // 원경 그림이 있으면 그 아래부터만 땅을 깐다 (위는 비워서 원경이 보이게)
    const yTop = vista ? -VISTA_GROUND : -TOWN.mt;
    this.groundTop = yTop;

    // 바탕: 뒷골목 자갈 + 거리 연장
    for (let y = yTop; y < yBot; y++) for (let x = x0; x < x1; x++) {
      if (x >= 0 && x < W && y >= 0 && y < H + STREET_ROWS) continue;
      g.drawImage(Sprites.street(Sprites.variant(x, y)), x * TILE, y * TILE);
    }
    P.r(x0 * TILE, yStreet * TILE, (x1 - x0) * TILE, 1, PAL.s3);
    P.r(x0 * TILE, (yStreet + 1) * TILE, (x1 - x0) * TILE, 1, PAL.s1);
    // 차도 가운데 레일(증기 전차 선로)
    P.r(x0 * TILE, (yStreet + 2) * TILE + 5, (x1 - x0) * TILE, 1, PAL.i3);
    P.r(x0 * TILE, (yStreet + 2) * TILE + 11, (x1 - x0) * TILE, 1, PAL.i3);
    for (let x = x0 * TILE; x < x1 * TILE; x += 6) P.r(x, (yStreet + 2) * TILE + 4, 2, 9, 'rgba(40,30,24,0.5)');

    // 1) 이웃 가게들 — 같은 거리에 면한 건물 (가게 좌우)
    const row = (from, to) => {
      let x = from;
      while (x < to) {
        const w = Math.min(to - x, 3 + Math.floor(R() * 4));
        if (w >= 3) this.building(P, g, R, x, Math.max(-2, Math.floor(R() * 4) - 1), w, H, snowy, true);
        x += w + (R() < 0.5 ? 1 : 0);
      }
    };
    row(x0, -1); row(W + 1, x1);

    // 2) 뒤쪽 랜드마크 줄 — 원경 그림이 없을 때만 코드로 그린다
    if (!vista) {
    const landY = yTop + 3 + 8, landH = 5;
    const cx = Math.floor(W / 2);
    this.clockTower(P, g, cx - 2, landY - 1, snowy);
    this.factory(P, g, R, x0 + 1, landY + 1, Math.max(8, cx - 2 - (x0 + 1) - 2), landY + landH, snowy);
    this.gasometer(P, g, cx + 4, landY + 1);
    let bx = cx + 10;
    while (bx < x1 - 3) { const w = 3 + Math.floor(R() * 3); this.building(P, g, R, bx, landY + Math.floor(R() * 2), w, landY + landH, snowy, true); bx += w + 1; }
    // 뒷골목 (랜드마크와 가게 사이)
    for (let x = x0; x < x1; x++) P.r(x * TILE, (landY + landH) * TILE, TILE, 1, PAL.s1);
    }

    // 3) 앞쪽 (거리 아래) — 필지에 따라 다른 풍경
    const fy = H + STREET_ROWS;
    if (s.plotId === 'canal') this.canal(P, g, R, x0, x1, fy, yBot, snowy);
    else if (s.plotId === 'airship') this.dock(P, g, R, x0, x1, fy, yBot, snowy);
    else this.backRow(P, g, R, x0, x1, fy, yBot, snowy);

    // 원경과 경계: 그림 아래쪽 색으로 안개 띠, 가까운 마을에도 원경 색감을 살짝
    if (vista) {
      const hz = vista.haze, top = yTop * TILE;
      // 그림 아랫부분(땅 위 28px)부터 안개가 짙어지고, 땅 위 40px 에 걸쳐 걷힌다
      const grad = g.createLinearGradient(0, top - 28, 0, top + 40);
      grad.addColorStop(0, `rgba(${hz},0)`); grad.addColorStop(0.36, `rgba(${hz},0.9)`); grad.addColorStop(0.5, `rgba(${hz},0.75)`); grad.addColorStop(1, `rgba(${hz},0)`);
      g.fillStyle = grad; g.fillRect(x0 * TILE, top - 28, (x1 - x0) * TILE, 68);
      // 안개 속 굴뚝 연기처럼 옅은 덩어리 몇 개로 경계선을 흐트러뜨린다
      for (let i = 0; i < 14; i++) {
        const cx = x0 * TILE + R() * (x1 - x0) * TILE, cy = top - 6 + R() * 18, rx = 14 + R() * 22;
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
        rg.addColorStop(0, `rgba(${hz},0.35)`); rg.addColorStop(1, `rgba(${hz},0)`);
        g.fillStyle = rg; g.fillRect(cx - rx, cy - rx, rx * 2, rx * 2);
      }
      for (const [gc, al] of [[g, 0.14], [fgc, 0.14]]) {
        gc.save(); gc.globalCompositeOperation = 'source-atop';
        gc.fillStyle = `rgba(${vista.tone},${al})`; gc.fillRect(x0 * TILE, yTop * TILE, (x1 - x0) * TILE, (yBot - yTop) * TILE);
        gc.restore();
      }
    }
    this.bg = c;
  },

  // 원경 그림을 장면 해상도(도트 1칸 = 1px)로 줄여 캐시. 시차 스크롤 여유로 장면보다 조금 넓게.
  vistaImage(snowy) {
    const src = Sprites.sheets[snowy ? 'vista_snow' : 'vista_clear'] || Sprites.sheets.vista_clear;
    if (!src) return null;
    const key = (snowy ? 's' : 'c') + this.sceneW();
    if (this._vista && this._vistaKey === key) return this._vista;
    const VW = Math.round(this.sceneW() * 1.18), fullH = Math.round(VW * src.height / src.width);
    // 큰 그림을 반씩 여러 번 줄여야 부드럽게 줄어든다
    let cur = src, cw = src.width, ch = src.height;
    while (cw / 2 > VW) {
      const [c2, g2] = makeCanvas(Math.round(cw / 2), Math.round(ch / 2));
      g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high'; g2.drawImage(cur, 0, 0, c2.width, c2.height);
      cur = c2; cw = c2.width; ch = c2.height;
    }
    // 아래쪽 근경(절벽·폭포)은 우리 거리와 겹치니 위 70%만 쓴다
    const cropH = Math.round(fullH * 0.7);
    const [c, g] = makeCanvas(VW, cropH);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, cw, ch * 0.7, 0, 0, VW, cropH);
    // 경계 안개 색(그림 맨 아래 줄 평균)과 전체 색감(평균)
    const avg = (d, step) => { let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4 * step) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } return [r / n, gg / n, b / n].map(v => Math.round(v)).join(','); };
    // file:// 로 열면 브라우저가 픽셀 읽기를 막는다 → 날씨별 기본 색
    let haze = snowy ? '214,222,232' : '92,96,78', tone = snowy ? '176,186,200' : '120,104,84';
    try { haze = avg(g.getImageData(0, cropH - 6, VW, 6).data, 1); tone = avg(g.getImageData(0, 0, VW, cropH).data, 37); } catch (e) { /* 기본 색 사용 */ }
    this._vista = { canvas: c, haze, tone, w: VW, h: cropH };
    this._vistaKey = key;
    return this._vista;
  },

  // 원경: 카메라가 움직이면 천천히 따라온다(시차). 바닥 줄은 땅이 시작하는 곳에 맞춘다.
  drawVista(g, cam) {
    const v = this._vista; if (!v || this.groundTop !== -VISTA_GROUND) return;
    const SW = this.sceneW(), SH = this.sceneH();
    const room = (v.w - SW) / 2;
    const px = cam ? Math.max(-room, Math.min(room, (cam.x - SW / 2) * 0.22)) : 0, py = cam ? (cam.y - SH / 2) * 0.08 : 0;
    // 지난 프레임이 비치지 않게 원경 영역을 먼저 지운다
    g.clearRect(-this.ox(), -this.oy(), SW, this.oy() - VISTA_GROUND * TILE + 8);
    const x = -this.ox() - (v.w - SW) / 2 + px, y = -VISTA_GROUND * TILE + 6 - v.h + py;
    g.drawImage(v.canvas, Math.round(x), Math.round(y));
    // 그림 위로 남는 하늘: 그림 맨 윗줄 색으로 채움
    if (y > -this.oy()) { g.drawImage(v.canvas, 0, 0, v.w, 1, Math.round(x), -this.oy(), v.w, Math.ceil(y + this.oy()) + 1); }
  },

  roofTile(kind, snowy) {
    return Sprites._build(`roof_${kind}_${snowy ? 1 : 0}`, 16, 16, P => {
      const cols = { slate: ['#3a4250', '#4e5868', '#2a303a'], copper: [PAL.v1, PAL.v2, PAL.v0], clay: ['#8a3a26', '#a8503a', '#6a2a1a'], tar: ['#2e2a28', '#3e3834', '#1e1a18'] }[kind];
      P.r(0, 0, 16, 16, cols[0]);
      for (let r = 0; r < 4; r++) {
        const off = r % 2 ? 4 : 0;
        P.r(0, r * 4 + 3, 16, 1, cols[2]);
        for (let x = off; x < 16; x += 8) P.r(x, r * 4, 1, 3, cols[2]);
        P.r(0, r * 4, 16, 1, cols[1]);
      }
      if (snowy) {
        // 지붕에 소복이 덮인 눈: 기와 줄만 살짝 비친다
        P.r(0, 0, 16, 16, '#eef2f7');
        for (let r = 0; r < 4; r++) { P.r(0, r * 4 + 3, 16, 1, '#c9d4e0'); if (r % 2) P.r(Math.floor(hash(r, 1, 3) * 12), r * 4 + 3, 3, 1, cols[0]); }
        P.noise(0, 0, 16, 16, ['#ffffff'], 0.08, 4);
      }
    }).canvas;
  },

  // 건물: 지붕(위) + 2칸 높이 정면 벽(아래). front=true 면 정면이 아래(거리 쪽)를 본다
  building(P, g, R, bx, by, w, bottom, snowy, front) {
    const roofs = ['slate', 'copper', 'clay', 'tar'], walls = ['redbrick', 'rawbrick', 'woodpanel', 'rivet', 'verdigris', 'damask'];
    const roof = roofs[Math.floor(R() * roofs.length)], wall = walls[Math.floor(R() * walls.length)];
    const faceTop = bottom - 2;
    this.cover(bx, by, w, bottom - by);
    for (let y = by; y < faceTop; y++) for (let x = bx; x < bx + w; x++) g.drawImage(this.roofTile(roof, snowy), x * TILE, y * TILE);
    // 지붕 테두리 & 용마루
    P.r(bx * TILE, by * TILE, w * TILE, 1, PAL.k); P.r(bx * TILE, by * TILE, 1, (faceTop - by) * TILE, PAL.k); P.r((bx + w) * TILE - 1, by * TILE, 1, (faceTop - by) * TILE, PAL.k);
    P.r(bx * TILE, (faceTop - 1) * TILE + 13, w * TILE, 3, PAL.k);
    // 3/4 시점 경사: 위쪽 면은 어둡게, 앞쪽 면은 밝게, 가운데 용마루
    const mid = Math.floor((by + faceTop) / 2) * TILE;
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(bx * TILE + 1, by * TILE + 1, w * TILE - 2, mid - by * TILE);
    g.fillStyle = 'rgba(255,240,220,0.06)'; g.fillRect(bx * TILE + 1, mid, w * TILE - 2, faceTop * TILE - mid);
    if (faceTop - by >= 2) { P.r(bx * TILE + 1, mid - 1, w * TILE - 2, 3, PAL.k); P.r(bx * TILE + 1, mid, w * TILE - 2, 1, snowy ? '#ffffff' : PAL.s2); }
    // 지붕 소품: 채광창, 환기구, 구리 배관
    const area = (faceTop - by) * w;
    for (let i = 0; i < Math.floor(area / 10); i++) {
      const rx = (bx + Math.floor(R() * w)) * TILE + 3, ry = (by + 1 + Math.floor(R() * Math.max(1, faceTop - by - 2))) * TILE + 3, kind = R();
      if (kind < 0.4) { P.box(rx, ry, 10, 8, '#5a7a9a'); P.r(rx + 1, ry + 1, 8, 2, '#8ab0d0'); if (snowy) P.r(rx, ry - 1, 10, 2, PAL.wh); }
      else if (kind < 0.7) { P.box(rx + 2, ry, 6, 6, PAL.i2); P.r(rx + 1, ry - 1, 8, 2, PAL.i1); this.chimneys.push([rx + 5, ry - 2, 0.25]); }
      else { P.r(rx - 3, ry + 4, 18, 3, PAL.k); P.r(rx - 3, ry + 4, 18, 2, PAL.c2); P.r(rx - 3, ry + 4, 18, 1, PAL.c3); P.ring(rx + 6, ry + 5, 2, PAL.red2); }
    }
    // 정면
    for (let y = faceTop; y < bottom; y++) for (let x = bx; x < bx + w; x++) g.drawImage(Sprites.wall(wall, (x + y) & 1), x * TILE, y * TILE);
    P.r(bx * TILE, faceTop * TILE, w * TILE, 2, PAL.s3);
    // 창문 (밤에 켜짐)
    for (let x = bx; x < bx + w; x++) {
      if ((x - bx) % 2 === 1 || w <= 3) {
        const wx = x * TILE + 4, wy = faceTop * TILE + 5;
        P.box(wx, wy, 8, 9, '#2a3a52'); P.r(wx + 1, wy + 4, 6, 1, PAL.k); P.r(wx + 3, wy + 1, 1, 7, PAL.k);
        this.windows.push([wx + 1, wy + 1, 6, 7]);
      }
    }
    // 문 + 간판
    const dx = bx + Math.floor(w / 2);
    const doorY = (bottom - 1) * TILE;
    P.r(dx * TILE + 3, doorY + 2, 10, 14, PAL.k); P.r(dx * TILE + 4, doorY + 3, 8, 13, [PAL.w1, PAL.red1, PAL.g1, PAL.bl1][Math.floor(R() * 4)]); P.p(dx * TILE + 10, doorY + 9, PAL.b3);
    const signs = [PAL.b2, PAL.c2, PAL.v2, PAL.red2];
    P.box(dx * TILE - 2, faceTop * TILE + 1, 20, 6, signs[Math.floor(R() * signs.length)]); P.r(dx * TILE + 1, faceTop * TILE + 3, 14, 1, PAL.cr1);
    // 굴뚝
    if (faceTop - by >= 1) {
      const chx = (bx + 1 + Math.floor(R() * Math.max(1, w - 2))) * TILE + 4, chy = by * TILE - 6;
      P.box(chx, chy, 7, 12, PAL.red1); P.r(chx - 1, chy, 9, 2, PAL.s2);
      this.chimneys.push([chx + 3, chy - 1, 0.6]);
    }
  },

  clockTower(P, g, tx, ty, snowy) {
    const x = tx * TILE, y = ty * TILE, w = 4 * TILE, h = 7 * TILE;
    this.cover(tx, ty, 4, 7);
    // 몸통
    for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 4; xx++) g.drawImage(Sprites.wall('rawbrick', (xx + yy) & 1), x + xx * TILE, y + yy * TILE);
    P.r(x, y, 1, h, PAL.k); P.r(x + w - 1, y, 1, h, PAL.k);
    // 첨탑
    for (let i = 0; i < 22; i++) { const hw = 2 + Math.floor(i * 1.35); P.r(x + w / 2 - hw, y - 22 + i, hw * 2, 1, PAL.k); P.r(x + w / 2 - hw + 1, y - 22 + i, hw * 2 - 2, 1, i % 4 === 0 ? PAL.v2 : PAL.v1); P.r(x + w / 2 - hw + 1, y - 22 + i, Math.max(1, hw - 2), 1, PAL.v2); }
    P.r(x + w / 2 - 1, y - 30, 2, 9, PAL.b2); P.p(x + w / 2 - 1, y - 31, PAL.b4);
    if (snowy) for (let i = 2; i < 22; i += 3) { const hw = 2 + Math.floor(i * 1.35); P.r(x + w / 2 - hw + 1, y - 22 + i, hw - 1, 1, '#eef2f7'); }
    // 시계
    P.disc(x + w / 2, y + 22, 13, PAL.k); P.disc(x + w / 2, y + 22, 12, PAL.b1); P.disc(x + w / 2, y + 22, 10, PAL.cr2);
    for (let a = 0; a < 12; a++) { const ang = a * Math.PI / 6; P.p(Math.round(x + w / 2 + Math.cos(ang) * 8), Math.round(y + 22 + Math.sin(ang) * 8), PAL.k); }
    this.clock = [x + w / 2, y + 22];
    // 톱니 장식
    P.ring(x + 10, y + 52, 5, PAL.b1); P.ring(x + w - 10, y + 52, 5, PAL.b1);
    P.r(x + w / 2 - 6, y + h - 16, 12, 16, PAL.k); P.r(x + w / 2 - 5, y + h - 15, 10, 15, PAL.w1);
  },

  factory(P, g, R, tx, ty, w, bottom, snowy) {
    const x = tx * TILE;
    this.cover(tx, ty, w, bottom - ty);
    // 톱니 지붕
    for (let yy = ty; yy < bottom - 2; yy++) for (let xx = tx; xx < tx + w; xx++) g.drawImage(this.roofTile('tar', snowy), xx * TILE, yy * TILE);
    for (let xx = tx; xx < tx + w; xx += 2) { P.r(xx * TILE, ty * TILE, 2, (bottom - 2 - ty) * TILE, PAL.k); for (let yy = ty; yy < bottom - 2; yy++) P.r(xx * TILE + 2, yy * TILE + 2, 10, 4, '#5a7a8a'); }
    for (let yy = bottom - 2; yy < bottom; yy++) for (let xx = tx; xx < tx + w; xx++) g.drawImage(Sprites.wall('redbrick', (xx + yy) & 1), xx * TILE, yy * TILE);
    for (let xx = tx + 1; xx < tx + w - 1; xx += 2) { const wx = xx * TILE + 2, wy = (bottom - 2) * TILE + 5; P.box(wx, wy, 12, 10, '#2a3a52'); this.windows.push([wx + 1, wy + 1, 10, 8]); }
    // 큰 톱니바퀴
    const gx = x + (w * TILE) / 2, gy = (bottom - 1) * TILE + 2;
    for (let a = 0; a < 10; a++) { const ang = a * Math.PI / 5; P.r(Math.round(gx + Math.cos(ang) * 11) - 2, Math.round(gy + Math.sin(ang) * 11) - 2, 4, 4, PAL.b1); }
    P.disc(gx, gy, 10, PAL.b2); P.disc(gx, gy, 4, PAL.b0); P.disc(gx, gy, 2, PAL.b3);
    this.gear = [gx, gy];
    // 굴뚝 3개
    for (let i = 0; i < 3; i++) {
      const cx = x + 10 + i * Math.floor((w * TILE - 20) / 3), cy = ty * TILE - 34 - i * 6;
      P.r(cx, cy, 10, ty * TILE - cy + 8, PAL.k); P.r(cx + 1, cy, 8, ty * TILE - cy + 8, PAL.red1); P.r(cx + 2, cy, 2, ty * TILE - cy + 8, PAL.red2);
      for (let yy = cy + 6; yy < ty * TILE; yy += 10) P.r(cx + 1, yy, 8, 1, PAL.red0);
      P.r(cx - 1, cy, 12, 3, PAL.i1);
      this.chimneys.push([cx + 5, cy - 1, 1.6]);
    }
  },

  gasometer(P, g, tx, ty) {
    this.cover(tx, ty, 3, 3);
    const x = tx * TILE + 24, y = ty * TILE + 36;
    P.ellipse(x, y + 22, 26, 6, PAL.shadow);
    P.r(x - 24, y - 4, 48, 26, PAL.k); P.r(x - 23, y - 4, 46, 26, PAL.i2); P.r(x - 23, y - 4, 10, 26, PAL.i3); P.r(x + 13, y - 4, 10, 26, PAL.i1);
    P.ellipse(x, y - 4, 24, 7, PAL.k); P.ellipse(x, y - 4, 23, 6, PAL.i3); P.ellipse(x - 6, y - 6, 10, 2, PAL.i4);
    for (let i = -20; i <= 20; i += 8) P.r(x + i, y - 2, 1, 24, PAL.i0);
    P.r(x - 23, y + 8, 46, 1, PAL.i0);
  },

  canal(P, g, R, x0, x1, fy, yBot, snowy) {
    const wy0 = (fy + 1) * TILE, wy1 = (yBot - 3) * TILE;
    P.r(x0 * TILE, fy * TILE, (x1 - x0) * TILE, TILE, PAL.s1);
    for (let x = x0 * TILE; x < x1 * TILE; x += 8) { P.r(x, fy * TILE + 6, 1, 8, PAL.i1); } // 난간
    P.r(x0 * TILE, fy * TILE + 6, (x1 - x0) * TILE, 1, PAL.i2);
    P.r(x0 * TILE, wy0, (x1 - x0) * TILE, wy1 - wy0, snowy ? '#3a5a72' : '#2a5272');
    this.cover(x0, fy + 1, x1 - x0, Math.ceil((wy1 - wy0) / TILE));
    P.r(x0 * TILE, wy0, (x1 - x0) * TILE, 3, PAL.s0);
    for (let i = 0; i < 70; i++) P.r(Math.floor(R() * (x1 - x0) * TILE) + x0 * TILE, wy0 + 4 + Math.floor(R() * (wy1 - wy0 - 6)), 3, 1, '#4a7a9a');
    this.water = [x0 * TILE, wy0 + 4, (x1 - x0) * TILE, wy1 - wy0 - 6];
    this.boat = { y: wy0 + 10, x: x0 * TILE, dir: 1 };
    P.r(x0 * TILE, wy1, (x1 - x0) * TILE, TILE, PAL.s2);
    let x = x0; while (x < x1) { const w = 3 + Math.floor(R() * 3); this.roofRow(P, g, R, x, yBot - 2, w, 2, snowy); x += w + 1; }
  },

  dock(P, g, R, x0, x1, fy, yBot, snowy) {
    // 광장 바닥
    for (let y = fy; y < yBot; y++) for (let x = x0; x < x1; x++) g.drawImage(Sprites.floor('checker', 0), x * TILE, y * TILE);
    g.fillStyle = 'rgba(30,24,20,0.45)'; g.fillRect(x0 * TILE, fy * TILE, (x1 - x0) * TILE, (yBot - fy) * TILE);
    // 계류탑
    const mx = Math.floor((x0 + x1) / 2) * TILE + 40, my = (fy + 6) * TILE;
    this.FP.r(mx - 3, my - 70, 6, 76, PAL.k); this.FP.r(mx - 2, my - 70, 4, 76, PAL.i2);
    for (let yy = my - 64; yy < my; yy += 8) this.FP.line(mx - 8, yy, mx + 8, yy + 8, PAL.i1);
    this.FP.box(mx - 7, my - 76, 14, 8, PAL.b2); this.FP.p(mx, my - 79, PAL.red3);
    // 정박한 비행선
    this.airship(this.FP, mx - 78, my - 56, 1.2);
    // 화물 상자
    for (let i = 0; i < 6; i++) this.fgc.drawImage(Sprites.prop(i % 2 ? 'v_crate' : 'v_barrel'), (x0 + 2 + i * 3) * TILE, (yBot - 2) * TILE - 6);
  },

  backRow(P, g, R, x0, x1, fy, yBot, snowy) {
    let x = x0; while (x < x1) { const w = 3 + Math.floor(R() * 3); this.roofRow(P, g, R, x, fy + 1 + Math.floor(R() * 2), w, yBot - fy - 1, snowy); x += w + 1; }
  },

  // 거리 아래쪽 건물: 지붕만 보이고 뒷벽이 아래
  roofRow(P, g, R, bx, by, w, h, snowy) {
    const roofs = ['slate', 'clay', 'copper', 'tar'], roof = roofs[Math.floor(R() * roofs.length)];
    this.cover(bx, by, w, h);
    for (let y = by; y < by + h - 1; y++) for (let x = bx; x < bx + w; x++) g.drawImage(this.roofTile(roof, snowy), x * TILE, y * TILE);
    for (let x = bx; x < bx + w; x++) g.drawImage(Sprites.wall('rawbrick', x & 1), x * TILE, (by + h - 1) * TILE);
    P.r(bx * TILE, by * TILE, w * TILE, 2, PAL.k);
    const chx = (bx + 1) * TILE + 2, chy = by * TILE - 4; P.box(chx, chy, 6, 10, PAL.red1); this.chimneys.push([chx + 3, chy - 1, 0.5]);
  },

  airship(P, x, y, sc = 1) {
    const L = Math.round(64 * sc), Hh = Math.round(16 * sc);
    P.ellipse(x + L / 2, y + Hh / 2, L / 2, Hh / 2, PAL.k); P.ellipse(x + L / 2, y + Hh / 2, L / 2 - 1, Hh / 2 - 1, PAL.c2);
    P.ellipse(x + L / 2, y + Hh / 2 - 3, L / 2 - 6, Hh / 4, PAL.c3);
    for (let i = 8; i < L - 6; i += 10) P.r(x + i, y + 2, 1, Hh - 4, PAL.c1);
    P.r(x - 4, y + Hh / 2 - 6, 6, 12, PAL.k); P.r(x - 3, y + Hh / 2 - 5, 4, 10, PAL.red2);   // 꼬리날개
    P.box(x + L / 2 - 10, y + Hh, 20, 6, PAL.w2); P.r(x + L / 2 - 8, y + Hh + 2, 16, 1, PAL.glow2);
    P.line(x + L / 2 - 8, y + Hh - 1, x + L / 2 - 10, y + Hh + 1, PAL.k); P.line(x + L / 2 + 8, y + Hh - 1, x + L / 2 + 10, y + Hh + 1, PAL.k);
    P.ring(x + L / 2 + 14, y + Hh + 3, 2, PAL.b2);
  },

  // 매 프레임: 배경 + 움직이는 것들 (장면 좌표계, 가게 원점으로 translate 된 상태에서 호출)
  draw(g, P, t, dt) {
    this.ensure();
    this.drawVista(g, Render.cam);
    g.drawImage(this.bg, -this.ox(), -this.oy());
    // 공장 톱니 회전
    if (this.gear) { const [gx, gy] = this.gear, a = t * 0.8; for (let i = 0; i < 4; i++) { const ang = a + i * Math.PI / 2; P.p(Math.round(gx + Math.cos(ang) * 7), Math.round(gy + Math.sin(ang) * 7), PAL.b4); } }
    // 시계 바늘
    if (this.clock) {
      const [cx, cy] = this.clock, m = Game.s.min, hA = (m / 720) * Math.PI * 2 - Math.PI / 2, mA = (m % 60) / 60 * Math.PI * 2 - Math.PI / 2;
      P.line(cx, cy, Math.round(cx + Math.cos(hA) * 5), Math.round(cy + Math.sin(hA) * 5), PAL.k);
      P.line(cx, cy, Math.round(cx + Math.cos(mA) * 8), Math.round(cy + Math.sin(mA) * 8), PAL.red1);
    }
    // 굴뚝 연기
    for (const [x, y, r] of this.chimneys) if (Math.random() < dt * 3 * r) Game.puff(x, y, Math.random() < 0.5 ? 'rgba(200,196,190,0.7)' : 'rgba(150,146,140,0.7)', 1, 3);
    // 운하 물결 + 증기선
    if (this.water) {
      const [wx, wy, ww, wh] = this.water;
      for (let i = 0; i < 24; i++) { const xx = wx + ((i * 53 + Math.floor(t * 12)) % ww), yy = wy + ((i * 29) % wh); P.r(xx, yy, 4, 1, '#6aa0c0'); }
      const b = this.boat; b.x += dt * 10 * b.dir;
      if (b.x > wx + ww + 40) { b.dir = -1; } if (b.x < wx - 40) b.dir = 1;
      const bx = Math.round(b.x), by = b.y;
      P.r(bx - 14, by + 6, 28, 5, PAL.k); P.r(bx - 13, by + 6, 26, 4, PAL.w2); P.r(bx - 13, by + 6, 26, 1, PAL.w4);
      P.box(bx - 6, by, 12, 7, PAL.cr1); P.r(bx - 2, by - 6, 4, 6, PAL.red2); P.r(bx - 2, by - 6, 4, 1, PAL.k);
      if (Math.random() < dt * 4) Game.puff(bx, by - 7, 'rgba(230,230,230,0.8)', 1, 2);
      P.r(bx - 16 * b.dir, by + 10, 4, 1, '#a8d0e8');
    }
  },

  // ───────── 쌓인 눈 ─────────
  // 바깥 땅(건물·물·가게 실내가 아닌 칸)에 눈을 깐다. 깊이는 6단계로 끊어 캐시.
  isGround(x, y) {
    const s = Game.s;
    if (y < this.groundTop) return false;
    if (this.covered.has(x + ',' + y)) return false;
    if (x >= 0 && x < s.W && y >= 0 && y < s.H) return false;
    return true;
  },
  snowLayer(level) {
    const k = `${this.key}|snow${level}`;
    if (this.snowKey === k) return this.snowCanvas;
    const s = Game.s, [c, g] = makeCanvas(this.sceneW(), this.sceneH()), P = pen(g, this.ox(), this.oy());
    const d = level / 5, road0 = s.H + 1, road1 = s.H + STREET_ROWS - 1;
    for (let y = -TOWN.mt; y < s.H + STREET_ROWS + TOWN.mb; y++) for (let x = -TOWN.mx; x < s.W + TOWN.mx; x++) {
      if (!this.isGround(x, y)) continue;
      // 벽 바로 아래·옆은 눈더미(바람에 몰림), 차도는 바퀴 자국
      const nearWall = !this.isGround(x, y - 1) || !this.isGround(x - 1, y) || !this.isGround(x + 1, y);
      const road = y >= road0 && y <= road1;
      let dens = d * (nearWall ? 1.35 : 1) * (road ? 0.75 : 1);
      for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
        const gx = x * 16 + px, gy = y * 16 + py;
        // 덩어리진 눈: 저주파 + 고주파 섞기
        const n = hash(gx >> 2, gy >> 2, 77) * 0.6 + hash(gx, gy, 78) * 0.4;
        let dd = dens;
        if (road && (py === 5 || py === 6 || py === 11 || py === 12)) dd *= 0.25;   // 바퀴 자국
        if (nearWall && !this.isGround(x, y - 1) && py < 5) dd *= 1.4;
        if (n < dd * 0.95) P.p(gx, gy, n < dd * 0.3 ? '#ffffff' : n < dd * 0.7 ? '#eef3f8' : '#d6e0ea');
      }
    }
    // 가게 외벽 윗면과 거리 소품 위에 눈
    for (let x = 0; x < s.W; x++) { P.r(x * 16, -2, 16, Math.ceil(2 + d * 3), '#f4f8fb'); P.r(x * 16, (s.H - 1) * 16 - 1, 16, Math.ceil(1 + d * 2), '#f4f8fb'); }
    for (let y = 0; y < s.H; y++) { P.r(-1, y * 16, Math.ceil(1 + d * 3), 16, '#eef3f8'); P.r(s.W * 16 - Math.ceil(1 + d * 3) + 1, y * 16, Math.ceil(1 + d * 3), 16, '#eef3f8'); }
    this.snowKey = k; this.snowCanvas = c;
    return c;
  },
  drawFront(g) { if (this.front) g.drawImage(this.front, -this.ox(), -this.oy()); },
  drawSnow(g) {
    const lvl = Math.round((Game.s.snow || 0) * 5);
    if (lvl <= 0) return;
    g.drawImage(this.snowLayer(lvl), -this.ox(), -this.oy());
  },

  // 하늘을 지나가는 비행선 (가장 위에 그린다)
  drawSky(P, g, t) {
    const SW = this.sceneW(), x = ((t * 9) % (SW + 300)) - 150 - this.ox(), y = -this.oy() + 26 + Math.sin(t * 0.3) * 4;
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(x + 38, y + 120, 34, 7, 0, 0, Math.PI * 2); g.fill();
    this.airship(P, Math.round(x), Math.round(y), 1);
  },

  // 밤에 켜지는 창문
  drawWindows(P, dusk) {
    if (dusk < 0.25) return;
    for (const [x, y, w, h] of this.windows) {
      if (hash(x, y, Math.floor(Game.s.day)) < 0.3) continue;
      P.r(x, y, w, h, dusk > 0.6 ? PAL.glow2 : PAL.glow1);
      P.r(x + Math.floor(w / 2), y, 1, h, PAL.k); P.r(x, y + Math.floor(h / 2), w, 1, PAL.k);
    }
  },
};
