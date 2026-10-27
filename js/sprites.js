// 도트 스프라이트 — 모든 그래픽을 16px 격자에 정수 좌표로 그린다.
// assets/manifest.js 에 키를 등록하고 assets/sprites/<키>.png 를 두면 그 이미지로 교체된다.

const PAL = {
  k: '#140d0a', d: '#2a1d17', shadow: 'rgba(10,6,4,0.35)',
  w0: '#3a2416', w1: '#5a3920', w2: '#7d5230', w3: '#a5713f', w4: '#c9925a',
  b0: '#4f3610', b1: '#8a6220', b2: '#c8952f', b3: '#efc760', b4: '#fff0b0',
  c0: '#47200f', c1: '#7f3a20', c2: '#b85d33', c3: '#e08a55', c4: '#f6b98a',
  i0: '#17191c', i1: '#2e3237', i2: '#4c535a', i3: '#78828a', i4: '#a9b3ba',
  s0: '#3b3530', s1: '#5a524a', s2: '#7d746a', s3: '#a39a8e',
  red0: '#4a1418', red1: '#7c2027', red2: '#a8323a', red3: '#d1584f',
  g0: '#173226', g1: '#25503a', g2: '#3d7a4a', g3: '#6aa84f', g4: '#a3d26a',
  v0: '#1f4a44', v1: '#2f6e62', v2: '#4f9a86', v3: '#86c7ad',
  bl0: '#1b2e4a', bl1: '#2b4f7a', bl2: '#4a7fb5', bl3: '#8cc0e8',
  cr0: '#bfae90', cr1: '#ddd0b4', cr2: '#f2ead6', wh: '#fbf7ee',
  glow0: '#c2461c', glow1: '#ff8a2a', glow2: '#ffcf5a', glow3: '#fff4c0',
  pu0: '#3a2140', pu1: '#5e3566',
  skin: '#e8b48a', skin2: '#c28a62',
};

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 픽셀 펜: 캔버스 컨텍스트 위에 정수 사각형만 찍는다
function pen(g, ox = 0, oy = 0) {
  const P = {
    r(x, y, w, h, c) { g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); },
    p(x, y, c) { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); },
    disc(cx, cy, r, c) {
      g.fillStyle = c;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + r * 0.6) g.fillRect(ox + cx + x, oy + cy + y, 1, 1);
    },
    ring(cx, cy, r, c) {
      g.fillStyle = c;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (d <= r * r + r * 0.6 && d > (r - 1) * (r - 1) + (r - 1) * 0.6) g.fillRect(ox + cx + x, oy + cy + y, 1, 1);
      }
    },
    ellipse(cx, cy, rx, ry, c) {
      g.fillStyle = c;
      for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) g.fillRect(ox + cx + x, oy + cy + y, 1, 1);
    },
    line(x0, y0, x1, y1, c) {
      g.fillStyle = c;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= n; i++) g.fillRect(ox + Math.round(x0 + (x1 - x0) * i / n), oy + Math.round(y0 + (y1 - y0) * i / n), 1, 1);
    },
    // 외곽선 있는 박스
    box(x, y, w, h, fill, line = PAL.k) { P.r(x, y, w, h, line); P.r(x + 1, y + 1, w - 2, h - 2, fill); },
    noise(x, y, w, h, colors, density, seed) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const v = hash(i + x, j + y, seed);
        if (v < density) P.p(x + i, y + j, colors[Math.floor(hash(i, j, seed + 7) * colors.length)]);
      }
    },
    rivets(x0, y, x1, step, c = PAL.b3, c2 = PAL.b0) {
      for (let x = x0; x <= x1; x += step) { P.p(x, y, c); P.p(x, y + 1, c2); }
    },
  };
  return P;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

// ───────────── 바닥 ─────────────
const FLOOR_ART = {
  dirt(P, v) {
    P.r(0, 0, 16, 16, '#4e3c2a');
    P.noise(0, 0, 16, 16, ['#3f3022', '#5d4832', '#665038'], 0.35, 11 + v);
    P.noise(0, 0, 16, 16, ['#7a6a58', '#8a7864'], 0.03, 29 + v);
  },
  plank(P, v) {
    const cols = [PAL.w2, PAL.w3, PAL.w2, '#8a5c36'];
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      P.r(0, y, 16, 3, cols[(row + v) % 4]);
      P.r(0, y + 3, 16, 1, PAL.w0);
      P.noise(0, y, 16, 3, [PAL.w1, PAL.w4], 0.12, row * 13 + v);
      const seam = Math.floor(hash(row, v, 3) * 14) + 1;
      P.r(seam, y, 1, 3, PAL.w0);
      P.p(seam + 1, y + 1, PAL.k);
    }
  },
  herring(P) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const t = y + Math.abs((x % 8) - 4);
      const band = Math.floor(t / 3);
      const c = t % 3 === 0 ? PAL.w0 : [PAL.w2, PAL.w3, '#93613a'][band % 3];
      P.p(x, y, (x % 8 === 4 && t % 3 !== 0) ? PAL.w1 : c);
    }
  },
  checker(P) {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const dark = (x + y) % 2 === 0;
      P.r(x * 8, y * 8, 8, 8, dark ? '#24201e' : PAL.cr1);
      P.r(x * 8, y * 8, 8, 1, dark ? '#3a3330' : PAL.cr2);
      P.r(x * 8, y * 8, 1, 8, dark ? '#3a3330' : PAL.cr2);
    }
    P.r(0, 15, 16, 1, PAL.s1); P.r(15, 0, 1, 16, PAL.s1);
  },
  brassgrid(P) {
    P.r(0, 0, 16, 16, PAL.i1);
    for (let y = 1; y < 16; y += 3) for (let x = (y % 2) + 1; x < 16; x += 3) P.p(x, y, PAL.i2);
    P.r(0, 0, 16, 1, PAL.b1); P.r(0, 8, 16, 1, PAL.b1);
    P.r(0, 0, 1, 16, PAL.b1); P.r(8, 0, 1, 16, PAL.b1);
    P.r(0, 1, 16, 1, PAL.b0); P.r(0, 9, 16, 1, PAL.b0);
    [[0, 0], [8, 0], [0, 8], [8, 8]].forEach(([x, y]) => { P.p(x, y, PAL.b3); });
  },
  carpet(P) {
    P.r(0, 0, 16, 16, PAL.red1);
    P.noise(0, 0, 16, 16, [PAL.red0, PAL.red2], 0.18, 5);
    // 금색 다이아 무늬
    for (let i = 0; i < 4; i++) {
      P.p(8 - i, 4 + i, PAL.b2); P.p(8 + i, 4 + i, PAL.b2);
      P.p(8 - i, 12 - i, PAL.b2); P.p(8 + i, 12 - i, PAL.b2);
    }
    P.p(8, 8, PAL.b3); P.p(0, 0, PAL.b1); P.p(15, 15, PAL.b1); P.p(15, 0, PAL.b1); P.p(0, 15, PAL.b1);
  },
  marble(P, v) {
    P.r(0, 0, 16, 16, PAL.cr2);
    P.noise(0, 0, 16, 16, [PAL.cr1, PAL.wh], 0.25, 41 + v);
    let x = Math.floor(hash(v, 1, 9) * 16), y = 0;
    while (y < 16) { P.p(x, y, PAL.s3); if (hash(x, y, v) > 0.5) P.p(x + 1, y, PAL.cr0); x += hash(x, y, 77) > 0.5 ? 1 : -1; x = (x + 16) % 16; y++; }
    P.r(0, 15, 16, 1, PAL.cr0); P.r(15, 0, 1, 16, PAL.cr0);
  },
  // ── 추가 바닥재 ──
  cobble(P, v) {
    P.r(0, 0, 16, 16, '#3e3530');
    for (let row = 0; row < 4; row++) {
      const off = (row + v) % 2 ? 2 : 0;
      for (let x = -off; x < 16; x += 4) {
        const c = ['#7a6a5c', '#8a7866', '#6c5e52', '#94826e'][Math.floor(hash(x + 7, row, v + 3) * 4)];
        const x0 = Math.max(0, x), w = Math.min(3, 3 + x) - (x0 - x);
        if (w > 0) { P.r(x0, row * 4, w, 3, c); P.p(x0, row * 4, '#a8967e'); }
      }
    }
  },
  brickfloor(P, v) {
    P.r(0, 0, 16, 16, '#4a2a20');
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) {
      const vert = ((x + y) / 4) % 2 === 0;
      const c = ['#9a4a32', '#a85a3c', '#8a3e2a'][Math.floor(hash(x, y, v + 11) * 3)];
      if (vert) { P.r(x, y, 3, 1, c); P.r(x, y + 1, 3, 2, c); } else { P.r(x, y, 1, 3, c); P.r(x + 1, y, 2, 3, c); }
      P.p(x, y, '#c07050');
    }
  },
  parquet(P) {
    // 바구니 짜임: 4x4 블록마다 결 방향이 바뀐다
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
      const h = (bx + by) % 2 === 0, base = (bx * 3 + by) % 2 ? PAL.w3 : '#9a6a3e';
      P.r(bx * 4, by * 4, 4, 4, base);
      for (let k = 0; k < 4; k += 2) h ? P.r(bx * 4, by * 4 + k, 4, 1, PAL.w2) : P.r(bx * 4 + k, by * 4, 1, 4, PAL.w2);
      P.p(bx * 4 + 3, by * 4 + 3, PAL.w0);
    }
  },
  hextile(P) {
    // 8x8 팔각 타일을 줄마다 반 칸 어긋나게 → 육각 무늬처럼 보인다
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = y >> 3, lx = (x + (row % 2) * 4) % 8, ly = y % 8;
      const edge = (ly === 0 && lx >= 2 && lx <= 5) || (lx === 0 && ly >= 2 && ly <= 5) ||
        (lx + ly === 1) || (lx - ly === 6) || (ly - lx === 6) || (lx + ly === 13) || (lx === 7 && ly === 7) || (lx === 0 && ly === 0);
      const tone = ((x + (row % 2) * 4) >> 3) % 3 === 0 ? '#c9d8cc' : PAL.cr1;
      P.p(x, y, edge ? '#7a6e5c' : (ly <= 2 && lx >= 2 && lx <= 4 ? PAL.cr2 : tone));
    }
  },
  steamgrate(P) {
    P.r(0, 0, 16, 16, PAL.i0);
    for (let y = 1; y < 16; y += 3) { P.r(1, y, 14, 2, '#2a1610'); P.r(1, y, 14, 1, '#5a2a14'); }
    P.r(0, 0, 16, 1, PAL.i3); P.r(0, 15, 16, 1, PAL.i1); P.r(0, 0, 1, 16, PAL.i2); P.r(15, 0, 1, 16, PAL.i1);
    for (let y = 2; y < 16; y += 3) for (let x = 3; x < 15; x += 4) P.p(x, y, PAL.i2);
    P.p(1, 1, PAL.b3); P.p(14, 1, PAL.b3); P.p(1, 14, PAL.b3); P.p(14, 14, PAL.b3);
  },
  rug(P) {
    P.r(0, 0, 16, 16, '#1e2a4e');
    P.r(0, 0, 16, 2, PAL.red1); P.r(0, 14, 16, 2, PAL.red1); P.r(0, 0, 2, 16, PAL.red1); P.r(14, 0, 2, 16, PAL.red1);
    P.r(2, 2, 12, 1, PAL.b2); P.r(2, 13, 12, 1, PAL.b2); P.r(2, 2, 1, 12, PAL.b2); P.r(13, 2, 1, 12, PAL.b2);
    for (let i = 0; i < 3; i++) { P.p(8 - i, 5 + i, PAL.red2); P.p(7 + i, 5 + i, PAL.red2); P.p(8 - i, 10 - i, PAL.red2); P.p(7 + i, 10 - i, PAL.red2); }
    P.r(7, 7, 2, 2, PAL.b3);
    P.noise(3, 3, 10, 10, ['#2a3a62', '#18213e'], 0.15, 21);
  },
  mosaic(P) {
    const cols = [PAL.v2, PAL.b2, PAL.cr2, PAL.v1, PAL.b3];
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      const d = Math.abs(x - 7) + Math.abs(y - 7);
      const c = d < 3 ? PAL.b3 : d < 6 ? PAL.v2 : d < 9 ? cols[(x + y) % 3 + 2] : (x + y) % 4 ? PAL.cr1 : PAL.b1;
      P.r(x, y, 2, 2, c); P.p(x + 1, y + 1, '#00000022');
    }
    P.r(0, 15, 16, 1, PAL.b0); P.r(15, 0, 1, 16, PAL.b0);
  },
};

// ───────────── 벽 ─────────────
function wallCap(P) { P.r(0, 0, 16, 3, PAL.s1); P.r(0, 0, 16, 1, PAL.s3); P.r(0, 3, 16, 1, PAL.k); }
const WALL_ART = {
  rawbrick(P, v) { brickWall(P, ['#6b5a4c', '#5e4f43', '#77665a'], '#3a322c', v); },
  redbrick(P, v) { brickWall(P, ['#8e3a2a', '#a34834', '#7a3022'], '#40261e', v); },
  woodpanel(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.w1);
    P.r(2, 6, 5, 8, PAL.w2); P.r(9, 6, 5, 8, PAL.w2);
    P.r(2, 6, 5, 1, PAL.w3); P.r(9, 6, 5, 1, PAL.w3);
    P.r(2, 13, 5, 1, PAL.w0); P.r(9, 13, 5, 1, PAL.w0);
    P.r(0, 4, 16, 1, PAL.b1);
  },
  damask(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.g1);
    const m = [[8, 6], [7, 7], [9, 7], [6, 8], [10, 8], [8, 8], [7, 9], [9, 9], [8, 10], [8, 11]];
    m.forEach(([x, y]) => P.p(x, y, PAL.b2));
    P.p(0, 9, PAL.b1); P.p(15, 9, PAL.b1);
    P.r(0, 14, 16, 2, PAL.w1); P.r(0, 14, 16, 1, PAL.b1);
  },
  rivet(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.i2);
    P.r(0, 4, 16, 1, PAL.i3); P.r(7, 4, 1, 12, PAL.i1); P.r(8, 4, 1, 12, PAL.i3);
    [5, 10, 14].forEach(y => { P.p(2, y, PAL.i4); P.p(5, y, PAL.i4); P.p(10, y, PAL.i4); P.p(13, y, PAL.i4); });
    P.noise(0, 5, 16, 11, ['#6a4a34'], 0.04, 3);
  },
  verdigris(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.v1);
    P.noise(0, 4, 16, 12, [PAL.v2, PAL.v0, PAL.c2], 0.22, 17);
    P.r(0, 9, 16, 1, PAL.v0); P.rivets(1, 5, 15, 4, PAL.v3, PAL.v0); P.rivets(1, 11, 15, 4, PAL.v3, PAL.v0);
  },
  stained(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.i0);
    const glass = [PAL.bl2, PAL.red2, PAL.glow2, PAL.g2, PAL.pu1, PAL.bl3];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      P.r(2 + x * 4, 5 + y * 3, 3, 2, glass[(x + y * 2) % 6]);
      P.p(2 + x * 4, 5 + y * 3, PAL.wh);
    }
    P.r(1, 4, 1, 12, PAL.b1); P.r(14, 4, 1, 12, PAL.b1);
  },
  // ── 추가 벽 마감 ──
  rustplate(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.i1);
    P.noise(0, 4, 16, 12, ['#8a4a22', '#a85e2a', '#6a3418', PAL.i2], 0.45, 33);
    P.r(0, 9, 16, 1, PAL.i0); P.rivets(1, 5, 15, 5, PAL.i3, PAL.i0); P.rivets(1, 11, 15, 5, PAL.i3, PAL.i0);
    P.r(5, 10, 1, 4, '#5a2a14'); P.r(11, 5, 1, 3, '#5a2a14');
  },
  stripe(P) {
    wallCap(P);
    for (let x = 0; x < 16; x++) P.r(x, 4, 1, 8, Math.floor(x / 2) % 2 ? PAL.cr1 : PAL.red1);
    P.r(0, 4, 16, 1, PAL.b1);
    P.r(0, 12, 16, 4, PAL.w1); P.r(0, 12, 16, 1, PAL.w3); P.r(4, 13, 1, 3, PAL.w0); P.r(11, 13, 1, 3, PAL.w0);
  },
  subway(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, '#a8a29a');
    for (let row = 0; row < 4; row++) {
      const y = 4 + row * 3, off = row % 2 ? 4 : 0;
      for (let x = -off; x < 16; x += 8) { const x0 = Math.max(0, x); P.r(x0, y, Math.min(7, 7 + x) - (x0 - x), 2, PAL.wh); P.p(x0 + 1, y, '#ffffff'); }
    }
    P.r(0, 14, 16, 2, '#2e5a52'); P.r(0, 14, 16, 1, '#4f8a7a');
  },
  porthole(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.b1); P.r(0, 4, 16, 1, PAL.b3);
    P.disc(8, 10, 5, PAL.k); P.disc(8, 10, 4, PAL.b2); P.disc(8, 10, 3, '#4a7fb5'); P.r(6, 8, 2, 1, PAL.bl3); P.p(7, 9, PAL.wh);
    for (let a = 0; a < 6; a++) { const ang = a * Math.PI / 3; P.p(Math.round(8 + Math.cos(ang) * 5), Math.round(10 + Math.sin(ang) * 5), PAL.b4); }
    P.p(1, 5, PAL.b4); P.p(14, 5, PAL.b4); P.p(1, 14, PAL.b4); P.p(14, 14, PAL.b4);
  },
  bookwall(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.w0);
    const books = [PAL.red2, PAL.g2, PAL.bl1, PAL.b2, PAL.pu1, PAL.c2, PAL.cr1];
    [4, 10].forEach((y, r) => {
      for (let x = 0; x < 16; x++) if (hash(x, r, 5) > 0.12) P.r(x, y + (hash(x, r, 2) > 0.7 ? 1 : 0), 1, 5 - (hash(x, r, 2) > 0.7 ? 1 : 0), books[Math.floor(hash(x, r, 9) * books.length)]);
      P.r(0, y + 5, 16, 1, PAL.w2);
    });
  },
  gearwall(P) {
    wallCap(P);
    P.r(0, 4, 16, 12, PAL.w1); P.r(0, 4, 16, 1, PAL.w3);
    const gear = (cx, cy, r, c) => { for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; P.p(Math.round(cx + Math.cos(ang) * (r + 1)), Math.round(cy + Math.sin(ang) * (r + 1)), c); } P.disc(cx, cy, r, c); P.p(cx, cy, PAL.w0); };
    gear(5, 9, 3, PAL.b2); gear(11, 12, 2, PAL.c2); gear(12, 6, 1, PAL.b1);
  },
};
function brickWall(P, cols, mortar, v) {
  wallCap(P);
  P.r(0, 4, 16, 12, mortar);
  for (let row = 0; row < 4; row++) {
    const y = 4 + row * 3, off = row % 2 ? 4 : 0;
    for (let x = -off; x < 16; x += 8) {
      const c = cols[Math.floor(hash(x + 20, row, v) * cols.length)];
      P.r(Math.max(0, x), y, Math.min(7, 7 + x) - Math.max(0, x - x), 2, c);
    }
  }
}

// ───────────── 천장 ─────────────
const CEIL_ART = {
  beams(P) {
    P.r(0, 0, 16, 16, '#1c1410');
    P.r(0, 6, 16, 4, PAL.w1); P.r(0, 6, 16, 1, PAL.w2); P.r(0, 9, 16, 1, PAL.w0);
    P.r(6, 0, 3, 16, PAL.w0);
  },
  plaster(P) {
    P.r(0, 0, 16, 16, PAL.cr1);
    P.noise(0, 0, 16, 16, [PAL.cr0, PAL.cr2], 0.2, 8);
    P.r(0, 15, 16, 1, PAL.cr0);
  },
  tin(P) {
    P.r(0, 0, 16, 16, PAL.i3);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      P.r(i * 8 + 1, j * 8 + 1, 6, 6, PAL.i4); P.r(i * 8 + 2, j * 8 + 2, 4, 4, PAL.i3); P.p(i * 8 + 3, j * 8 + 3, PAL.wh);
    }
  },
  copper(P) {
    P.r(0, 0, 16, 16, PAL.c2);
    P.noise(0, 0, 16, 16, [PAL.c1, PAL.c3], 0.18, 31);
    P.r(0, 15, 16, 1, PAL.c0); P.r(15, 0, 1, 16, PAL.c0);
    P.p(2, 2, PAL.c4); P.p(13, 2, PAL.c4); P.p(2, 13, PAL.c4); P.p(13, 13, PAL.c4);
  },
  glassdome(P) {
    P.r(0, 0, 16, 16, PAL.bl2);
    P.r(0, 0, 16, 7, PAL.bl3);
    P.noise(0, 0, 16, 16, [PAL.wh], 0.02, 3);
    P.r(0, 7, 16, 1, PAL.i1); P.r(7, 0, 1, 16, PAL.i1); P.r(0, 15, 16, 1, PAL.i1); P.r(15, 0, 1, 16, PAL.i1);
  },
  // ── 추가 천장 ──
  duct(P) {
    P.r(0, 0, 16, 16, '#24201c');
    P.r(0, 3, 16, 5, PAL.i2); P.r(0, 3, 16, 1, PAL.i4); P.r(0, 7, 16, 1, PAL.i0);
    for (let x = 2; x < 16; x += 5) P.r(x, 3, 1, 5, PAL.i1);
    P.r(11, 9, 3, 7, PAL.c1); P.r(11, 9, 1, 7, PAL.c3);
  },
  coffered(P) {
    P.r(0, 0, 16, 16, PAL.w2);
    P.r(2, 2, 12, 12, PAL.w0); P.r(3, 3, 10, 10, PAL.w1); P.r(4, 4, 8, 8, '#4a3020');
    P.r(2, 2, 12, 1, PAL.w4); P.r(2, 2, 1, 12, PAL.w3); P.p(8, 8, PAL.b3);
  },
  brassplate(P) {
    P.r(0, 0, 16, 16, PAL.b1);
    for (let y = 0; y < 16; y += 4) for (let x = (y / 4) % 2 * 2; x < 16; x += 4) { P.r(x, y, 2, 2, PAL.b2); P.p(x, y, PAL.b3); }
    P.r(0, 15, 16, 1, PAL.b0); P.r(15, 0, 1, 16, PAL.b0);
  },
  gearceil(P) {
    P.r(0, 0, 16, 16, PAL.c1);
    P.noise(0, 0, 16, 16, [PAL.c0, PAL.c2], 0.15, 41);
    for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; P.r(Math.round(8 + Math.cos(ang) * 6) - 1, Math.round(8 + Math.sin(ang) * 6) - 1, 2, 2, PAL.b2); }
    P.ring(8, 8, 5, PAL.b2); P.disc(8, 8, 2, PAL.b3); P.p(8, 8, PAL.b0);
  },
  fresco(P, v) {
    P.r(0, 0, 16, 16, '#7ab0d8'); P.r(0, 0, 16, 5, '#5a94c4');
    // 구름
    const cx = 4 + Math.floor(hash(v, 3, 7) * 8);
    P.ellipse(cx, 9, 4, 2, '#f2f4f6'); P.ellipse(cx + 3, 8, 3, 2, '#ffffff'); P.r(cx - 3, 10, 8, 1, '#d6dde4');
    P.r(0, 0, 16, 1, PAL.b2); P.r(0, 15, 16, 1, PAL.b2); P.r(0, 0, 1, 16, PAL.b2); P.r(15, 0, 1, 16, PAL.b2);
    P.p(1, 1, PAL.b4); P.p(14, 14, PAL.b4);
  },
};

// 거리(보도블록)
function streetArt(P, v) {
  // 원경 그림의 길과 같은 따뜻한 회갈색 자갈
  P.r(0, 0, 16, 16, '#3e3028');
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 2 : 0;
    for (let x = -off; x < 16; x += 4) {
      const c = ['#7a6856', '#8a7662', '#6c5c4c', '#957f68'][Math.floor(hash(x + v * 5, row, 2) * 4)];
      const x0 = Math.max(0, x), w = Math.max(0, Math.min(3, 3 + x));
      P.r(x0, row * 4, w, 3, c);
      if (w) P.p(x0, row * 4, '#a8927a');
    }
  }
}

// ───────────── 오브젝트 ─────────────
// 각 함수: (P) 는 좌상단 (0, 0) = 스프라이트 캔버스 원점. 바닥 점유 영역은 (0, tall) 부터 시작.
const OBJ_ART = {
  boiler: { tall: 14, draw(P) {
    const T = 14;
    P.ellipse(16, T + 28, 14, 3, PAL.shadow);
    // 굴뚝
    P.box(21, 0, 5, 12, PAL.i2); P.r(22, 1, 1, 10, PAL.i3); P.r(20, 0, 7, 2, PAL.i1);
    // 몸통
    P.r(3, 10, 26, 30, PAL.k);
    P.r(4, 11, 24, 28, PAL.c2);
    P.r(4, 11, 4, 28, PAL.c1); P.r(23, 11, 5, 28, PAL.c1); P.r(26, 11, 2, 28, PAL.c0);
    P.r(10, 11, 3, 28, PAL.c3); P.r(11, 11, 1, 28, PAL.c4);
    // 돔
    P.ellipse(16, 11, 12, 4, PAL.k); P.ellipse(16, 11, 11, 3, PAL.c3); P.r(10, 9, 6, 1, PAL.c4);
    // 리벳 띠
    P.r(4, 18, 24, 2, PAL.b1); P.rivets(5, 18, 27, 3); P.r(4, 32, 24, 2, PAL.b1); P.rivets(5, 32, 27, 3);
    // 압력계
    P.disc(9, 25, 4, PAL.k); P.disc(9, 25, 3, PAL.b2); P.disc(9, 25, 2, PAL.cr2);
    // 화실 문
    P.box(15, 23, 11, 9, PAL.i1); P.r(17, 25, 7, 5, PAL.glow0);
    [18, 20, 22].forEach(x => P.r(x, 25, 1, 5, PAL.i0));
    P.p(24, 27, PAL.b3);
    // 받침
    P.box(2, 39, 28, 5, PAL.i1); P.r(3, 40, 26, 1, PAL.i3);
  }},
  radiator: { tall: 5, draw(P) {
    P.r(1, 19, 14, 2, PAL.shadow);
    P.r(1, 2, 14, 17, PAL.k);
    for (let i = 0; i < 6; i++) { P.r(2 + i * 2, 3, 1, 15, PAL.i3); P.r(3 + i * 2, 3, 1, 15, PAL.i2); }
    P.r(2, 3, 12, 1, PAL.i4); P.r(2, 17, 12, 1, PAL.i1);
    P.disc(13, 2, 1, PAL.red2);
  }},
  automaton: { tall: 12, draw(P) {
    P.ellipse(8, 25, 5, 2, PAL.shadow);
    P.r(5, 25, 2, 3, PAL.i1); P.r(9, 25, 2, 3, PAL.i1);
    P.box(3, 12, 10, 14, PAL.b2); P.r(4, 13, 2, 12, PAL.b3); P.r(10, 13, 2, 12, PAL.b1);
    P.disc(8, 18, 2, PAL.glow1); P.p(8, 18, PAL.glow3);
    P.r(1, 14, 2, 8, PAL.i2); P.r(13, 14, 2, 8, PAL.i2);
    P.disc(8, 7, 5, PAL.k); P.disc(8, 7, 4, PAL.b2); P.r(5, 4, 3, 1, PAL.b4);
    P.r(5, 7, 2, 2, PAL.glow2); P.r(9, 7, 2, 2, PAL.glow2);
    P.r(8, 0, 1, 3, PAL.i3); P.p(8, 0, PAL.red3);
  }},
  espresso: { tall: 9, draw(P) {
    P.r(1, 23, 14, 2, PAL.shadow);
    // 받침장
    P.box(0, 13, 16, 12, PAL.w2); P.r(1, 14, 14, 1, PAL.w4); P.r(2, 17, 5, 6, PAL.w1); P.r(9, 17, 5, 6, PAL.w1);
    // 본체
    P.box(2, 4, 12, 10, PAL.b2); P.r(3, 5, 2, 8, PAL.b3); P.r(11, 5, 2, 8, PAL.b1);
    P.r(3, 9, 10, 1, PAL.c1);
    // 돔 & 독수리
    P.ellipse(8, 4, 4, 2, PAL.k); P.ellipse(8, 4, 3, 1, PAL.b3);
    P.r(7, 0, 2, 3, PAL.b1); P.p(6, 1, PAL.b2); P.p(9, 1, PAL.b2);
    // 그룹헤드 & 컵
    P.r(4, 11, 2, 2, PAL.i1); P.r(10, 11, 2, 2, PAL.i1);
    P.r(4, 13, 2, 1, PAL.wh); P.r(10, 13, 2, 1, PAL.wh);
    // 스팀 완드
    P.r(13, 8, 1, 4, PAL.i3);
  }},
  kettle: { tall: 7, draw(P) {
    P.r(2, 21, 12, 2, PAL.shadow);
    P.r(3, 15, 1, 7, PAL.i1); P.r(12, 15, 1, 7, PAL.i1);
    P.box(2, 13, 12, 3, PAL.i2); P.r(5, 14, 6, 1, PAL.glow0);
    P.disc(8, 8, 5, PAL.k); P.disc(8, 8, 4, PAL.c2); P.r(5, 5, 2, 3, PAL.c4); P.r(10, 8, 2, 4, PAL.c1);
    P.line(12, 7, 15, 4, PAL.c1); P.p(15, 3, PAL.c2);
    P.r(5, 1, 7, 1, PAL.k); P.r(5, 1, 1, 3, PAL.k); P.r(11, 1, 1, 3, PAL.k);
    P.r(7, 3, 2, 1, PAL.b2);
  }},
  oven: { tall: 9, draw(P) {
    P.r(1, 23, 14, 2, PAL.shadow);
    P.box(11, 0, 4, 6, PAL.i2);
    P.box(1, 4, 14, 20, PAL.i1); P.r(2, 5, 12, 1, PAL.i3); P.r(2, 5, 1, 18, PAL.i2);
    P.r(1, 8, 14, 1, PAL.b1);
    P.disc(8, 15, 4, PAL.b1); P.disc(8, 15, 3, PAL.glow0); P.disc(8, 16, 2, PAL.glow1); P.p(7, 14, PAL.glow3);
    P.r(4, 21, 8, 1, PAL.b2);
    P.p(3, 6, PAL.red3); P.p(5, 6, PAL.b3);
  }},
  sink: { tall: 5, draw(P) {
    P.r(2, 19, 12, 2, PAL.shadow);
    P.r(6, 12, 4, 8, PAL.cr0); P.r(6, 12, 1, 8, PAL.wh);
    P.ellipse(8, 9, 7, 4, PAL.k); P.ellipse(8, 9, 6, 3, PAL.wh); P.ellipse(8, 10, 4, 2, PAL.cr1);
    P.p(8, 11, PAL.i1);
    P.r(5, 3, 1, 4, PAL.b2); P.r(10, 3, 1, 4, PAL.b2); P.r(5, 3, 6, 1, PAL.b2);
    P.p(4, 3, PAL.bl2); P.p(11, 3, PAL.red2); P.p(8, 4, PAL.b3); P.p(8, 5, PAL.b1);
  }},
  counter: { tall: 8, draw(P) {
    P.r(0, 22, 32, 2, PAL.shadow);
    P.box(0, 7, 32, 17, PAL.w2);
    P.r(1, 7, 30, 3, PAL.w4); P.r(1, 10, 30, 1, PAL.b2);
    for (let i = 0; i < 4; i++) { P.r(2 + i * 8, 12, 6, 10, PAL.w1); P.r(2 + i * 8, 12, 6, 1, PAL.w3); }
    // 금전등록기
    P.box(23, 0, 8, 8, PAL.b2); P.r(24, 1, 6, 2, PAL.b4); P.r(24, 4, 6, 2, PAL.b0); P.p(26, 5, PAL.cr2); P.p(28, 5, PAL.cr2);
  }},
  table_wood: { tall: 3, draw(P) {
    P.ellipse(8, 15, 6, 2, PAL.shadow);
    P.r(7, 9, 2, 6, PAL.w0);
    P.ellipse(8, 7, 7, 5, PAL.k); P.ellipse(8, 7, 6, 4, PAL.w2); P.ellipse(7, 6, 4, 2, PAL.w3); P.r(4, 10, 8, 1, PAL.w1);
  }},
  table_brass: { tall: 3, draw(P) {
    P.ellipse(8, 15, 6, 2, PAL.shadow);
    P.r(7, 9, 2, 6, PAL.i1); P.r(5, 14, 6, 1, PAL.i2);
    P.ellipse(8, 7, 7, 5, PAL.k); P.ellipse(8, 7, 6, 4, PAL.b2); P.ellipse(7, 6, 4, 2, PAL.b3); P.r(4, 10, 8, 1, PAL.b1);
    P.p(5, 5, PAL.b4);
  }},
  table_long: { tall: 3, draw(P) {
    P.r(2, 16, 28, 2, PAL.shadow);
    P.r(3, 12, 2, 6, PAL.w0); P.r(27, 12, 2, 6, PAL.w0);
    P.box(0, 2, 32, 11, PAL.w2); P.r(1, 3, 30, 2, PAL.w3);
    P.r(1, 6, 30, 3, PAL.cr2); P.r(1, 9, 30, 1, PAL.cr0);
    P.r(14, 4, 4, 2, PAL.b2); P.p(15, 3, PAL.glow2); P.p(16, 3, PAL.glow3);
  }},
  chair_wood: { tall: 6, draw(P) {
    P.r(3, 19, 10, 2, PAL.shadow);
    P.r(4, 14, 1, 6, PAL.w0); P.r(11, 14, 1, 6, PAL.w0);
    P.box(3, 10, 10, 5, PAL.w2); P.r(4, 11, 8, 1, PAL.w4);
    P.box(3, 0, 10, 11, PAL.w1); P.r(5, 2, 2, 8, PAL.w3); P.r(9, 2, 2, 8, PAL.w3); P.r(4, 1, 8, 1, PAL.w3);
  }},
  chair_leather: { tall: 6, draw(P) {
    P.r(2, 19, 12, 2, PAL.shadow);
    P.box(1, 0, 14, 20, PAL.red1);
    P.r(2, 1, 12, 9, PAL.red2); P.p(5, 4, PAL.red0); P.p(10, 4, PAL.red0); P.p(7, 7, PAL.red0);
    P.r(1, 9, 3, 10, PAL.red0); P.r(12, 9, 3, 10, PAL.red0);
    P.r(4, 11, 8, 6, PAL.red2); P.r(4, 11, 8, 1, PAL.red3);
    P.rivets(2, 18, 14, 2);
  }},
  sofa: { tall: 6, draw(P) {
    P.r(1, 19, 30, 2, PAL.shadow);
    P.box(0, 0, 32, 20, PAL.g1);
    P.r(1, 1, 30, 9, PAL.g2);
    for (let x = 4; x < 30; x += 4) { P.p(x, 3, PAL.g0); P.p(x - 2, 6, PAL.g0); }
    P.r(0, 8, 4, 12, PAL.k); P.r(1, 9, 2, 10, PAL.g0); P.r(28, 8, 4, 12, PAL.k); P.r(29, 9, 2, 10, PAL.g0);
    P.r(4, 11, 12, 6, PAL.g2); P.r(16, 11, 12, 6, PAL.g2); P.r(15, 11, 2, 6, PAL.g0);
    P.r(4, 11, 24, 1, PAL.g3);
  }},
  plant: { tall: 12, draw(P) {
    P.ellipse(8, 27, 5, 1, PAL.shadow);
    P.box(4, 19, 8, 9, PAL.b2); P.r(5, 20, 2, 7, PAL.b3); P.r(3, 19, 10, 2, PAL.b1);
    P.r(7, 10, 2, 9, PAL.g0);
    const leaves = [[-6, -2], [-5, -6], [0, -9], [5, -6], [6, -2], [-3, -8], [3, -8]];
    leaves.forEach(([dx, dy]) => P.line(8, 11, 8 + dx, 11 + dy, PAL.g2));
    leaves.forEach(([dx, dy]) => P.line(8, 10, 8 + dx, 10 + dy, PAL.g3));
    P.p(8, 2, PAL.g4); P.p(3, 5, PAL.g4); P.p(13, 5, PAL.g4);
  }},
  bookshelf: { tall: 14, draw(P) {
    P.r(1, 28, 14, 2, PAL.shadow);
    P.box(0, 0, 16, 30, PAL.w1); P.r(1, 0, 14, 2, PAL.w3);
    const books = [PAL.red2, PAL.g2, PAL.bl1, PAL.b2, PAL.pu1, PAL.c2, PAL.cr1, PAL.red1];
    [3, 11, 19].forEach((y, row) => {
      let x = 2;
      while (x < 14) {
        const h = 6 + Math.floor(hash(x, row, 4) * 2);
        const c = books[Math.floor(hash(x, row, 9) * books.length)];
        P.r(x, y + 7 - h, 1 + (x % 3 === 0 ? 1 : 0), h, c); x += x % 3 === 0 ? 2 : 1;
        if (hash(x, row, 1) > 0.8) x++;
      }
      P.r(1, y + 7, 14, 1, PAL.w0);
    });
    P.r(1, 27, 14, 2, PAL.w0);
  }},
  gramophone: { tall: 10, draw(P) {
    P.r(2, 24, 12, 2, PAL.shadow);
    P.box(2, 15, 12, 10, PAL.w2); P.r(3, 16, 10, 1, PAL.w4); P.r(4, 19, 8, 4, PAL.w1);
    P.ellipse(7, 15, 5, 1, PAL.k);
    P.r(9, 8, 2, 7, PAL.b1);
    // 나팔
    P.disc(9, 5, 5, PAL.k); P.disc(9, 5, 4, PAL.b2); P.disc(9, 5, 2, PAL.b0); P.r(6, 2, 3, 1, PAL.b4);
  }},
  clock: { tall: 18, draw(P) {
    P.r(2, 32, 12, 2, PAL.shadow);
    P.box(2, 0, 12, 34, PAL.w1);
    P.r(3, 1, 10, 1, PAL.w3); P.r(1, 0, 14, 2, PAL.w0);
    P.disc(8, 7, 4, PAL.b1); P.disc(8, 7, 3, PAL.cr2); P.r(8, 5, 1, 3, PAL.k); P.r(8, 7, 2, 1, PAL.k);
    P.box(5, 13, 6, 15, PAL.i0); P.r(8, 14, 1, 9, PAL.b1);
    P.disc(8, 24, 2, PAL.b2);
    P.r(3, 30, 10, 3, PAL.w0);
  }},
  globe: { tall: 8, draw(P) {
    P.ellipse(8, 22, 5, 1, PAL.shadow);
    P.r(5, 21, 6, 2, PAL.b1); P.r(7, 16, 2, 5, PAL.b1);
    P.disc(8, 9, 6, PAL.k); P.disc(8, 9, 5, PAL.bl1);
    [[5, 7], [6, 7], [6, 8], [5, 9], [9, 6], [10, 6], [10, 7], [11, 8], [9, 11], [10, 12], [8, 12]].forEach(([x, y]) => P.p(x, y, PAL.g2));
    P.p(6, 6, PAL.bl3);
    P.ring(8, 9, 7, PAL.b2);
  }},
  telescope: { tall: 10, draw(P) {
    P.ellipse(8, 24, 6, 1, PAL.shadow);
    P.line(8, 14, 3, 25, PAL.w1); P.line(8, 14, 13, 25, PAL.w1); P.line(8, 14, 8, 25, PAL.w0);
    P.line(1, 13, 14, 3, PAL.k); P.line(1, 12, 14, 2, PAL.b2); P.line(2, 12, 14, 3, PAL.b2); P.line(2, 11, 13, 2, PAL.b3);
    P.r(13, 1, 3, 3, PAL.b1); P.r(0, 12, 2, 2, PAL.i2);
  }},
  organ: { tall: 20, draw(P) {
    P.r(1, 34, 30, 2, PAL.shadow);
    const hs = [12, 16, 20, 18, 14, 20, 16, 12, 18, 20, 14, 10];
    hs.forEach((h, i) => { const x = 3 + i * 2; P.r(x, 20 - h, 2, h, PAL.b2); P.p(x, 20 - h, PAL.b4); P.r(x + 1, 20 - h, 1, h, PAL.b1); P.p(x, 18 - Math.floor(h / 3), PAL.k); });
    P.box(0, 18, 32, 18, PAL.w1); P.r(1, 19, 30, 2, PAL.w3);
    P.r(4, 24, 24, 3, PAL.wh); for (let x = 5; x < 28; x += 2) P.p(x, 24, PAL.k);
    P.r(3, 29, 26, 5, PAL.w0);
  }},
  fountain: { tall: 8, draw(P) {
    P.ellipse(16, 30, 15, 6, PAL.shadow);
    P.ellipse(16, 26, 15, 9, PAL.k); P.ellipse(16, 26, 14, 8, PAL.s3); P.ellipse(16, 26, 12, 6, PAL.bl1); P.ellipse(16, 25, 10, 4, PAL.bl2);
    P.r(14, 8, 4, 18, PAL.s2); P.r(14, 8, 1, 18, PAL.s3);
    // 톱니
    for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; P.r(Math.round(16 + Math.cos(ang) * 7) - 1, Math.round(7 + Math.sin(ang) * 7) - 1, 2, 2, PAL.b1); }
    P.disc(16, 7, 6, PAL.b2); P.disc(16, 7, 2, PAL.b0); P.r(13, 3, 3, 1, PAL.b4);
  }},
  floorlamp: { tall: 14, draw(P) {
    P.ellipse(8, 29, 4, 1, PAL.shadow);
    P.r(5, 27, 6, 2, PAL.k); P.r(6, 27, 4, 1, PAL.b1);
    P.r(7, 8, 2, 20, PAL.k); P.r(7, 8, 1, 19, PAL.b2);
    P.box(4, 2, 8, 8, PAL.b1); P.r(5, 3, 6, 6, PAL.glow2); P.r(6, 4, 2, 3, PAL.glow3);
    P.r(3, 1, 10, 2, PAL.k); P.r(4, 1, 8, 1, PAL.b2); P.p(8, 0, PAL.b3);
  }},
  tablelamp: { tall: 4, draw(P) {
    P.ellipse(8, 19, 5, 1, PAL.shadow);
    P.box(3, 13, 10, 7, PAL.w2); P.r(4, 14, 8, 1, PAL.w4);
    P.r(7, 6, 2, 7, PAL.b1);
    P.ellipse(8, 5, 5, 3, PAL.k); P.ellipse(8, 5, 4, 2, PAL.glow2); P.r(6, 4, 3, 1, PAL.glow3);
  }},
  tubeman: { tall: 4, draw(P) {
    // 받침 송풍기 (몸통은 렌더러가 매 프레임 흔들며 그린다)
    P.ellipse(8, 19, 6, 1, PAL.shadow);
    P.box(2, 12, 12, 8, PAL.b1); P.r(3, 13, 10, 1, PAL.b3); P.r(3, 17, 10, 1, PAL.b0);
    P.disc(8, 16, 2, PAL.i1); P.p(8, 16, PAL.b4); P.r(12, 8, 2, 5, PAL.c2);
  }},
  monstera: { tall: 12, draw(P) {
    P.ellipse(8, 27, 5, 1, PAL.shadow);
    P.box(4, 20, 8, 8, PAL.cr1); P.r(5, 21, 6, 1, PAL.wh);
    const leaf = (cx, cy, r) => { P.disc(cx, cy, r, PAL.g0); P.disc(cx, cy, r - 1, PAL.g2); P.p(cx - 1, cy, PAL.g0); P.p(cx + 1, cy - 1, PAL.g0); P.p(cx, cy - r + 1, PAL.g3); };
    P.line(8, 20, 4, 8, PAL.g1); P.line(8, 20, 12, 7, PAL.g1); P.line(8, 20, 8, 4, PAL.g1);
    leaf(4, 9, 4); leaf(12, 8, 4); leaf(8, 4, 4); leaf(9, 14, 3);
  }},
  snakeplant: { tall: 10, draw(P) {
    P.ellipse(8, 25, 4, 1, PAL.shadow);
    P.box(4, 19, 8, 7, PAL.i2); P.r(5, 20, 6, 1, PAL.i3);
    [[5, 6], [7, 2], [9, 4], [11, 7], [6, 10]].forEach(([x, t]) => { P.r(x, t, 2, 19 - t, PAL.g0); P.r(x, t + 1, 1, 18 - t, PAL.g2); P.p(x + 1, t + 4, PAL.g4); P.p(x, t + 9, PAL.g4); });
  }},
  ficus: { tall: 20, draw(P) {
    P.ellipse(8, 35, 5, 1, PAL.shadow);
    P.box(4, 28, 8, 8, PAL.c1); P.r(5, 29, 6, 1, PAL.c3);
    P.r(7, 14, 2, 14, PAL.w1);
    for (const [x, y] of [[4, 6], [11, 5], [8, 2], [5, 12], [11, 11], [8, 9]]) { P.ellipse(x, y, 3, 2, PAL.g0); P.ellipse(x, y, 2, 1, PAL.g1); P.p(x - 1, y - 1, PAL.g3); }
  }},
  celadon: { tall: 8, draw(P) {
    P.ellipse(8, 23, 4, 1, PAL.shadow);
    P.r(6, 1, 4, 2, PAL.k); P.r(7, 2, 2, 2, '#7fb39b');
    P.ellipse(8, 9, 5, 5, PAL.k); P.ellipse(8, 9, 4, 4, '#8ec2a8');
    P.r(5, 13, 6, 9, PAL.k); P.r(6, 13, 4, 9, '#8ec2a8'); P.r(6, 21, 4, 2, '#6a9a82');
    P.p(6, 7, '#c8e8d6'); P.p(9, 9, '#5f8f78'); P.p(7, 11, '#5f8f78'); P.p(8, 15, '#5f8f78');
  }},
  moonjar: { tall: 6, draw(P) {
    P.ellipse(8, 21, 6, 1, PAL.shadow);
    P.r(6, 2, 4, 2, PAL.k); P.r(7, 3, 2, 1, PAL.wh);
    P.disc(8, 12, 7, PAL.k); P.disc(8, 12, 6, '#f2eee2'); P.ellipse(6, 9, 2, 2, '#ffffff'); P.r(3, 15, 10, 1, '#d8d2c2');
  }},
  onggi: { tall: 4, draw(P) {
    P.ellipse(8, 19, 6, 1, PAL.shadow);
    P.r(5, 3, 6, 2, PAL.k); P.r(6, 4, 4, 1, '#5a3420');
    P.ellipse(8, 11, 6, 7, PAL.k); P.ellipse(8, 11, 5, 6, '#6e3e22'); P.r(4, 8, 8, 1, '#8a5432'); P.p(6, 7, '#a0663c');
  }},
  arclamp: { tall: 0, draw(P) {
    P.line(0, 4, 15, 6, PAL.i1);
    [[3, 4], [8, 5], [13, 6]].forEach(([x, y]) => { P.r(x, y + 1, 1, 2, PAL.i1); P.disc(x, y + 5, 2, PAL.glow1); P.p(x, y + 5, PAL.glow3); });
  }},
  // 천장 오브젝트 (tall 0)
  gaslamp: { tall: 0, draw(P) { P.ring(8, 8, 5, PAL.b1); P.disc(8, 8, 3, PAL.glow2); P.disc(8, 8, 1, PAL.glow3); P.r(8, 0, 1, 3, PAL.i2); } },
  chandelier: { tall: 0, draw(P) {
    for (let a = 0; a < 6; a++) { const ang = a * Math.PI / 3; const x = Math.round(8 + Math.cos(ang) * 6), y = Math.round(8 + Math.sin(ang) * 6); P.line(8, 8, x, y, PAL.b1); P.p(x, y, PAL.glow2); P.p(x, y - 1, PAL.glow3); }
    P.disc(8, 8, 2, PAL.b2); P.p(8, 8, PAL.b4);
  }},
  fan: { tall: 0, draw(P) {
    P.r(1, 7, 14, 2, PAL.w1); P.r(7, 1, 2, 14, PAL.w1); P.r(1, 7, 14, 1, PAL.w3); P.r(7, 1, 1, 14, PAL.w3);
    P.disc(8, 8, 2, PAL.b2); P.p(8, 8, PAL.b0);
  }},
  pipedeco: { tall: 0, draw(P) {
    P.r(0, 4, 16, 3, PAL.c1); P.r(0, 4, 16, 1, PAL.c3); P.r(10, 0, 3, 16, PAL.c1); P.r(10, 0, 1, 16, PAL.c3);
    P.ring(11, 5, 3, PAL.red2); P.p(11, 5, PAL.b2);
  }},
};

// 레시피 아이콘 (9x9)
const ICON_STYLE = {
  espresso:   { kind: 'cup', liquid: '#3a1f12', foam: '#7a4a2a' },
  americano:  { kind: 'mug', liquid: '#2a160c', foam: '#4a2a18' },
  latte:      { kind: 'mug', liquid: '#b88a5e', foam: PAL.wh },
  cappuccino: { kind: 'cup', liquid: '#a07040', foam: PAL.wh },
  mocha:      { kind: 'mug', liquid: '#5a2e18', foam: '#c98a5a' },
  earlgrey:   { kind: 'teacup', liquid: '#b5562a', foam: '#d07a3a' },
  milktea:    { kind: 'teacup', liquid: '#d2a273', foam: '#e8c49a' },
  hotchoco:   { kind: 'mug', liquid: '#4a2414', foam: '#f0d8c0' },
  scone:      { kind: 'scone' },
  gearcookie: { kind: 'cookie' },
  brasscake:  { kind: 'cake' },
  goguma:     { kind: 'potato' },
};
function drawIcon(P, id) {
  const s = ICON_STYLE[id] || { kind: 'cup', liquid: '#3a1f12' };
  if (s.kind === 'cup' || s.kind === 'mug' || s.kind === 'teacup') {
    const top = s.kind === 'mug' ? 1 : 3;
    P.r(1, top, 6, 8 - top - 1, PAL.k); P.r(2, top + 1, 4, 8 - top - 3, PAL.wh);
    P.r(2, top, 4, 1, s.foam); P.r(2, top + 1, 4, 1, s.liquid);
    P.r(7, top + 1, 1, 1, PAL.k); P.r(8, top + 2, 1, 2, PAL.k); P.r(7, top + 3, 1, 1, PAL.k);
    if (s.kind === 'teacup') P.r(0, 7, 9, 1, PAL.cr0); else P.r(1, 8, 7, 1, PAL.cr0);
    if (s.kind === 'teacup') { P.r(2, 4, 4, 1, PAL.b2); }
  } else if (s.kind === 'scone') {
    P.ellipse(4, 5, 4, 3, PAL.k); P.ellipse(4, 5, 3, 2, '#d9a35a'); P.r(2, 3, 3, 1, '#f0c880'); P.p(3, 5, PAL.red1); P.p(6, 6, PAL.red1);
  } else if (s.kind === 'cookie') {
    P.disc(4, 4, 4, PAL.k); P.disc(4, 4, 3, '#c98a4a');
    [[4, 0], [0, 4], [8, 4], [4, 8]].forEach(([x, y]) => P.p(x, y, '#c98a4a'));
    P.disc(4, 4, 1, '#6a3a1a');
  } else if (s.kind === 'potato') {   // 반으로 가른 군고구마: 보랏빛 껍질 + 노란 속살 + 김
    P.ellipse(4, 6, 4, 2, PAL.k); P.ellipse(4, 6, 3, 1, '#7a2e4a'); P.r(1, 5, 7, 1, '#9a4060');
    P.r(2, 5, 5, 1, '#f2b640'); P.r(3, 4, 3, 1, '#ffd870'); P.p(4, 5, '#ffe9a0');
    P.p(2, 1, PAL.cr1); P.p(3, 0, PAL.cr1); P.p(6, 2, PAL.cr1); P.p(5, 1, PAL.cr1);
  } else if (s.kind === 'cake') {
    P.r(0, 3, 9, 6, PAL.k); P.r(1, 4, 7, 4, '#6a3a1a'); P.r(1, 4, 7, 1, PAL.b3); P.r(1, 6, 7, 1, PAL.cr2);
    P.p(4, 1, PAL.red2); P.p(4, 2, PAL.g2);
  }
}

// 임시 손님 도트 (14 x 24, 2등신) — assets/chars/ 시트가 없을 때만 쓴다.
// t.f: 긴 머리 + 치마, t.small: 아이 체형(머리·몸통이 4px 아래로)
// 증기 로봇 직원 (16×24, 발밑 = y23). model: tray 서빙 · brush 청소 · kettle 바리스타
function drawRobotArt(P, model, frame, face) {
  const f = frame % 4, back = face === 'up', side = face === 'side', bob = f % 2;
  const eye = (x, y) => { P.r(x, y, 2, 2, PAL.k); P.p(x, y, PAL.glow2); P.p(x + 1, y + 1, PAL.glow1); };
  if (model === 'brush') {   // 구리 돔 청소봇: 바퀴 + 회전 솔
    P.ellipse(8, 23, 6, 1, PAL.shadow);
    P.r(2, 19, 12, 4, PAL.k); P.r(3, 20, 10, 2, PAL.i1);
    for (let i = 0; i < 3; i++) P.disc(4 + i * 4, 21, 1, (i + f) % 2 ? PAL.i3 : PAL.i2);   // 바퀴
    P.ellipse(8, 15, 6, 5, PAL.k); P.ellipse(8, 15, 5, 4, PAL.c2); P.r(4, 12, 4, 1, PAL.c4); P.r(3, 17, 10, 2, PAL.c1);
    P.r(2, 18, 12, 1, PAL.b2);   // 황동 띠
    if (!back) { P.r(7, 7, 2, 5, PAL.i2); P.disc(8, 6, 2, PAL.k); P.disc(8, 6, 1, PAL.glow2); P.p(side ? 9 : 8, 6, PAL.glow3); }
    else { P.r(7, 9, 2, 3, PAL.i2); P.r(6, 13, 4, 2, PAL.i1); }
    const bx = side ? 13 : 1;   // 솔
    P.r(bx, 21, 3, 2, PAL.w2); for (let i = 0; i < 3; i++) P.p(bx + ((i + f) % 3), 23, PAL.cr1);
    return;
  }
  const kettle = model === 'kettle';
  const body = kettle ? [PAL.v1, PAL.v3, PAL.v0] : [PAL.b2, PAL.b3, PAL.b1];
  P.ellipse(8, 23, 5, 1, PAL.shadow);
  // 다리 (걷기 4프레임)
  const l = [0, 1, 0, -1][f];
  P.r(4, 18, 3, 5 + Math.min(0, l), PAL.k); P.r(9, 18, 3, 5 - Math.max(0, l), PAL.k);
  P.r(5, 18, 1, 4 + Math.min(0, l), PAL.i3); P.r(10, 18, 1, 4 - Math.max(0, l), PAL.i3);
  // 몸통 (원통 보일러)
  const by = 10 - bob;
  P.r(3, by, 10, 9, PAL.k); P.r(4, by + 1, 8, 7, body[0]); P.r(4, by + 1, 2, 7, body[1]); P.r(10, by + 1, 2, 7, body[2]);
  P.r(3, by + 3, 10, 1, PAL.k); P.p(5, by + 3, PAL.b3); P.p(10, by + 3, PAL.b3);   // 리벳 띠
  if (!back) {
    if (kettle) { P.disc(8, by + 5, 2, PAL.k); P.disc(8, by + 5, 1, PAL.cr2); P.p(8, by + 4, PAL.red2); }   // 압력계
    else { P.r(7, by + 5, 2, 2, PAL.glow1); P.p(7, by + 5, PAL.glow3); }                                 // 화실 창
  } else { P.r(6, by + 4, 4, 3, PAL.i1); P.p(7, by + 5, PAL.i3); }
  // 팔
  P.r(1, by + 1, 2, 6, PAL.k); P.r(13, by + 1, 2, 6, PAL.k); P.r(1, by + 2, 1, 4, PAL.i3); P.r(14, by + 2, 1, 4, PAL.i3);
  if (model === 'tray' && !back) { P.r(side ? 11 : 12, by - 1, 5, 1, PAL.i4); P.r(side ? 11 : 12, by, 5, 1, PAL.k); }   // 쟁반
  // 머리
  const hy = by - 8;
  if (kettle) {   // 주전자 머리 + 주둥이
    P.ellipse(8, hy + 4, 4, 4, PAL.k); P.ellipse(8, hy + 4, 3, 3, PAL.c2); P.r(6, hy + 1, 3, 1, PAL.c4);
    P.r(side ? 12 : 11, hy + 3, 3, 2, PAL.k); P.p(side ? 13 : 12, hy + 3, PAL.c3);
    P.r(7, hy - 1, 2, 2, PAL.k); P.p(7, hy - 1, PAL.b3);
  } else {        // 유리 돔 머리 + 굴뚝
    P.disc(8, hy + 4, 4, PAL.k); P.disc(8, hy + 4, 3, PAL.i2); P.r(6, hy + 1, 2, 1, PAL.i4);
    P.r(7, hy - 2, 2, 3, PAL.k); P.p(7, hy - 2, PAL.i3);
  }
  if (!back) { if (side) eye(9, hy + 4); else { eye(5, hy + 4); eye(9, hy + 4); } }
  else P.r(6, hy + 4, 4, 1, PAL.i1);
}

function drawCustomerArt(P, t, sitting, frame) {
  const by = sitting ? 3 : 0, k = t.small ? 4 : 0, hair = t.hair || '#4a2e1c';
  P.ellipse(7, 23, 4, 1, PAL.shadow);
  if (!sitting) {
    const f = frame % 2;
    P.r(4, 19, 2, f ? 4 : 3, PAL.k); P.r(8, 19, 2, f ? 3 : 4, PAL.k);
    P.r(4, 19, 2, f ? 3 : 2, PAL.d); P.r(8, 19, 2, f ? 2 : 3, PAL.d);
  }
  // 코트
  const cy = by + 11 + k, ch = 9 - k;
  P.r(3, cy, 8, ch, PAL.k);
  P.r(4, cy + 1, 6, ch - 2, t.coat);
  P.r(9, cy + 1, 1, ch - 2, PAL.k); P.r(4, cy + 1, 1, ch - 2, 'rgba(255,255,255,0.15)');
  if (t.f && !sitting) { P.r(2, cy + ch - 3, 10, 3, PAL.k); P.r(3, cy + ch - 3, 8, 2, t.coat); }
  P.r(6, cy + 1, 2, 2, PAL.cr1);
  P.p(7, cy + 4, PAL.b3);
  P.r(2, cy + 1, 2, ch - 3, PAL.k); P.r(10, cy + 1, 2, ch - 3, PAL.k);
  P.r(2, cy + 1, 1, ch - 4, t.coat); P.r(11, cy + 1, 1, ch - 4, t.coat);
  P.p(2, cy + ch - 3, PAL.skin); P.p(11, cy + ch - 3, PAL.skin);
  // 머리
  const hy = by + 4 + k;
  if (t.f) { P.r(2, hy + 2, 10, 8, PAL.k); P.r(3, hy + 2, 8, 7, hair); }
  P.r(3, hy, 8, 8, PAL.k);
  P.r(4, hy + 1, 6, 6, PAL.skin);
  P.r(4, hy + 6, 6, 1, PAL.skin2);
  P.p(5, hy + 4, PAL.k); P.p(8, hy + 4, PAL.k);
  P.p(4, hy + 5, '#e88a7a'); P.p(9, hy + 5, '#e88a7a');
  P.r(4, hy + 1, 6, 2, hair);
  // 모자
  if (t.tophat) {
    P.r(4, hy - 5, 6, 6, PAL.k); P.r(5, hy - 4, 4, 4, t.hat); P.r(5, hy - 1, 4, 1, PAL.red2);
    P.r(2, hy, 10, 2, PAL.k); P.r(3, hy, 8, 1, t.hat);
  } else {
    P.r(3, hy - 2, 8, 4, PAL.k); P.r(4, hy - 1, 6, 2, t.hat); P.r(9, hy + 1, 3, 1, PAL.k); P.r(4, hy - 1, 3, 1, 'rgba(255,255,255,0.18)');
  }
  if (t.goggles) { P.r(3, hy + 1, 8, 1, PAL.b0); P.r(4, hy + 1, 2, 1, PAL.b3); P.r(8, hy + 1, 2, 1, PAL.b3); }
}

// 캐릭터 시트 규격: 32x32 프레임, 8열 x 3행 (256 x 96)
//   열: 0-1 대기, 2-5 걷기, 6 앉기, 7 동작(주인공=서빙, 손님=먹기)
//   행: 0 정면(아래), 1 뒷면(위), 2 옆(오른쪽 — 왼쪽은 좌우 반전)
const CHAR_FRAME = 32, CHAR_ROWS = { down: 0, up: 1, side: 2 };

// 고양이 (16 x 12, 옆모습 — 왼쪽은 반전). pose: walk | sit | nap
function drawCatArt(P, k, pose, frame) {
  const [f0, f1, f2] = k.fur, big = k.big ? 1 : 0;
  P.ellipse(8, 11, 5 + big, 1, PAL.shadow);
  if (pose === 'nap') {
    // 웅크린 식빵 자세
    P.ellipse(8, 8, 6 + big, 3, PAL.k); P.ellipse(8, 8, 5 + big, 2, f0);
    P.r(4, 7, 1, 2, f1); P.r(7, 6, 1, 2, f1); P.r(10, 7, 1, 2, f1);
    P.disc(12 + big, 7, 2, PAL.k); P.disc(12 + big, 7, 1, f0); P.p(11 + big, 4, PAL.k); P.p(13 + big, 4, PAL.k); P.p(11 + big, 5, f0); P.p(13 + big, 5, f0);
    P.r(11 + big, 7, 2, 1, PAL.k);           // 감은 눈
    P.r(3, 10, 8, 1, PAL.k); P.r(3, 10, 7, 1, f1); // 감싼 꼬리
    P.p(9, 9, f2);
    return;
  }
  if (pose === 'sit') {
    P.ellipse(7, 8, 3 + big, 3, PAL.k); P.ellipse(7, 8, 2 + big, 2, f0); P.r(6, 8, 2, 3, f2);
    P.disc(8, 4, 3, PAL.k); P.disc(8, 4, 2, f0);
    P.r(6, 0, 2, 2, PAL.k); P.r(9, 0, 2, 2, PAL.k); P.p(6, 1, f1); P.p(10, 1, f1);
    P.p(7, 4, PAL.k); P.p(9, 4, PAL.k); P.p(8, 5, '#e88a9a'); P.r(7, 2, 3, 1, f1);
    P.r(3, 9, 1, 2, PAL.k); P.r(3, 10, 4, 1, f1); P.r(2, 7, 1, 3, PAL.k); // 꼬리
    return;
  }
  // 걷기
  const f = frame % 2;
  P.r(3, 4, 9 + big, 5, PAL.k); P.r(4, 5, 7 + big, 3, f0); P.r(4, 7, 7 + big, 1, f2);
  P.r(5, 5, 1, 2, f1); P.r(8, 5, 1, 2, f1);
  P.r(f ? 4 : 5, 9, 1, 2, PAL.k); P.r(f ? 10 : 9, 9, 1, 2, PAL.k); P.r(f ? 6 : 7, 9, 1, 1, PAL.k);
  P.disc(12 + big, 4, 3, PAL.k); P.disc(12 + big, 4, 2, f0);
  P.p(11 + big, 0, PAL.k); P.p(14 + big, 0, PAL.k); P.p(11 + big, 1, f1); P.p(14 + big, 1, f1);
  P.p(13 + big, 4, PAL.k); P.p(14 + big, 5, '#e88a9a');
  P.line(3, 5, 1, 1 + f, PAL.k); P.line(2, 5, 1, 2 + f, f1);
}

// NAPLE 저장소 이미지 시트
// 원경 그림 (사용자 제작 배경) — 마을 뒤쪽 하늘·산·공장 자리에 깐다
const VISTA_SHEETS = { vista_clear: 'assets/bg/town_clear.webp', vista_snow: 'assets/bg/town_snow.webp' };
const NAPLE_SHEETS = {
  props: 'assets/naple/props_atlas.png',
  player: 'assets/naple/player_sheet.png',
  kenney: 'assets/naple/kenney_tilemap.png',
};
// Kenney Pixel Platformer 타일 (18px, [열, 행])
const KENNEY_TILES = { coin: [11, 7], heart: [4, 2], heartHalf: [5, 2], heartEmpty: [6, 2], snowman: [5, 7] };

// ───────── 타일 변형 ─────────
// 같은 마감재를 넓게 깔아도 바둑판처럼 보이지 않게: 칸마다 6가지 변형을 고르고,
// 변형마다 사용 흔적(얼룩·긁힘·옹이)을 다르게 얹고, 홀수 변형은 좌우 반전한다.
const TILE_VARIANTS = 6;
// 무늬가 칸 경계를 넘어 이어지거나 좌우가 정해진 재질은 반전하지 않는다
const NO_FLIP = new Set(['herring', 'hextile', 'checker', 'mosaic', 'brassgrid', 'rug', 'carpet', 'tin', 'coffered',
  'brassplate', 'gearceil', 'glassdome', 'fresco', 'porthole', 'gearwall', 'stained', 'damask', 'woodpanel', 'stripe']);

function weatherTile(c, kind, id, v) {
  const g = c.getContext('2d'), img = g.getImageData(0, 0, 16, 16), d = img.data;
  const seed = [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) + v * 101 + (kind === 'wall' ? 5 : kind === 'ceil' ? 9 : 0);
  const top = kind === 'wall' ? 4 : 0;   // 벽은 위 갓돌(0~3줄)은 건드리지 않는다
  const shade = (i, f) => { for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] * f)); };
  // 1) 잔 얼룩: 픽셀 몇 개를 살짝 밝게/어둡게
  for (let y = top; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = hash(x, y, seed);
    if (r < 0.07) shade((y * 16 + x) * 4, 0.84 + hash(x, y, seed + 1) * 0.3);
  }
  // 2) 변형마다 하나씩 눈에 띄는 흔적
  const fx = 2 + Math.floor(hash(v, 1, seed) * 11), fy = top + 2 + Math.floor(hash(v, 2, seed) * (11 - top));
  const kindOf = v % 3;
  if (v > 0) {
    if (kindOf === 0) { // 닳은 자국 (커피 얼룩은 지울 수 있는 별도 레이어 — Game.s.stains)
      for (let y = 0; y <= 1; y++) for (let x = -1; x <= 1; x++) if (hash(x, y, seed + 3) < 0.6) shade(((fy + y) * 16 + fx + x) * 4, 1.08);
    } else if (kindOf === 1) { // 긁힘
      for (let k = 0; k < 4; k++) { const px = fx + k, py = fy + (k >> 1); if (px < 16 && py < 16) shade((py * 16 + px) * 4, 1.18); }
    } else { // 옹이·흠집
      shade((fy * 16 + fx) * 4, 0.7); if (fx + 1 < 16) shade((fy * 16 + fx + 1) * 4, 0.85);
    }
  }
  g.putImageData(img, 0, 0);
  if (v % 2 === 1 && !NO_FLIP.has(id)) {
    const [c2, g2] = makeCanvas(16, 16);
    g2.translate(16, 0); g2.scale(-1, 1); g2.drawImage(c, 0, 0);
    return c2;
  }
  return c;
}

const Sprites = {
  cache: new Map(),
  images: {},
  sheets: {},

  chars: {},
  loadChars(ids) {
    return Promise.all((ids || []).map(id => new Promise(res => {
      const img = new Image();
      img.onload = () => { this.chars[id] = img; res(); };
      img.onerror = () => { console.warn('캐릭터 시트 로드 실패:', id); res(); };
      img.src = `assets/chars/${id}.png`;
    })));
  },
  hasChar(id) { return !!this.chars[id]; },
  // 직원 유니폼: 목 아래 옷 픽셀만 지정 색으로 (얼굴·머리·손·외곽선은 그대로)
  charTint(id, face, col, hue) {
    const k = `cht_${id}_${face}_${col}_${hue}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const src = this.charFrame(id, face, col), [c, g] = makeCanvas(CHAR_FRAME, CHAR_FRAME);
    g.drawImage(src, 0, 0);
    let im;
    try { im = g.getImageData(0, 0, CHAR_FRAME, CHAR_FRAME); }
    catch (e) {   // file:// 등 픽셀을 못 읽는 환경: 몸통 아래쪽을 '색상' 혼합으로 물들인다
      g.globalCompositeOperation = 'color'; g.fillStyle = `hsl(${hue},60%,45%)`; g.fillRect(0, 18, CHAR_FRAME, 12);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-over';
      this.cache.set(k, c); return c;
    }
    const d = im.data, W = CHAR_FRAME;
    let top = W, bottom = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    const neck = top + Math.round((bottom - top) * 0.44), feet = bottom - 2;
    for (let y = neck; y < feet; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] < 128) continue;
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
      if (l < 0.11 || mx - mn < 0.04 && l > 0.8) continue;                     // 외곽선·흰 셔츠
      let hh = 0; if (mx !== mn) { const dd = mx - mn; hh = mx === r ? ((gg - b) / dd) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4; hh = (hh * 60 + 360) % 360; }
      const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
      if (hh >= 8 && hh <= 42 && l > 0.58 && sat > 0.5) continue;                // 피부(손)
      const L = Math.min(0.78, l * 1.05 + 0.04), S = 0.55, C = (1 - Math.abs(2 * L - 1)) * S, X = C * (1 - Math.abs((hue / 60) % 2 - 1)), m = L - C / 2;
      const [r1, g1, b1] = hue < 60 ? [C, X, 0] : hue < 120 ? [X, C, 0] : hue < 180 ? [0, C, X] : hue < 240 ? [0, X, C] : hue < 300 ? [X, 0, C] : [C, 0, X];
      d[i] = (r1 + m) * 255; d[i + 1] = (g1 + m) * 255; d[i + 2] = (b1 + m) * 255;
    }
    g.putImageData(im, 0, 0);
    this.cache.set(k, c);
    return c;
  },
  charFrame(id, face, col) {
    const k = `ch_${id}_${face}_${col}`;
    if (!this.cache.has(k)) {
      const [c, g] = makeCanvas(CHAR_FRAME, CHAR_FRAME);
      g.drawImage(this.chars[id], col * CHAR_FRAME, CHAR_ROWS[face] * CHAR_FRAME, CHAR_FRAME, CHAR_FRAME, 0, 0, CHAR_FRAME, CHAR_FRAME);
      this.cache.set(k, c);
    }
    return this.cache.get(k);
  },

  loadSheets() {
    const blds = Object.fromEntries((window.BUILDING_MANIFEST || []).map(e => typeof e === 'string' ? e : e.id).map(id => ['bld_' + id, `assets/buildings/${id}.png`]));
    return Promise.all(Object.entries({ ...NAPLE_SHEETS, ...VISTA_SHEETS, ...blds }).map(([k, src]) => new Promise(res => {
      const img = new Image();
      img.onload = () => { this.sheets[k] = img; res(); };
      img.onerror = () => { console.warn('NAPLE 시트 로드 실패:', src); res(); };
      img.src = src;
    })));
  },
  crop(sheet, x, y, w, h) {
    const [c, g] = makeCanvas(w, h);
    if (this.sheets[sheet]) g.drawImage(this.sheets[sheet], x, y, w, h, 0, 0, w, h);
    return c;
  },
  prop(key) {
    const k = 'prop_' + key;
    if (!this.cache.has(k)) { const [x, y, w, h] = NAPLE_PROPS[key]; this.cache.set(k, this.crop('props', x, y, w, h)); }
    return this.cache.get(k);
  },
  kenney(name) {
    const k = 'ken_' + name;
    if (!this.cache.has(k)) { const [c, r] = KENNEY_TILES[name]; this.cache.set(k, this.crop('kenney', c * 18, r * 18, 18, 18)); }
    return this.cache.get(k);
  },
  // player_sheet: 32x32 프레임 (대기 2, 걷기 4, 시전 3) — 주인공 시트가 없을 때 바리스타 대역
  playerFrame(i) { const k = 'pl_' + i; if (!this.cache.has(k)) this.cache.set(k, this.crop('player', i * 32, 0, 32, 32)); return this.cache.get(k); },

  loadOverrides(keys) {
    const jobs = (keys || []).map(key => new Promise(res => {
      const img = new Image();
      img.onload = () => { this.images[key] = img; this.cache.delete(key); res(); };
      img.onerror = () => { console.warn('스프라이트 로드 실패:', key); res(); };
      img.src = `assets/sprites/${key}.png`;
    }));
    return Promise.all(jobs);
  },

  _build(key, w, h, fn) {
    if (this.cache.has(key)) return this.cache.get(key);
    let entry;
    if (this.images[key]) {
      const img = this.images[key];
      entry = { canvas: img, tall: Math.max(0, img.height - h) };
    } else {
      const [c, g] = makeCanvas(w, h);
      fn(pen(g));
      entry = { canvas: c, tall: 0 };
    }
    this.cache.set(key, entry);
    return entry;
  },

  // 마감재 타일: 직접 넣은 그림(assets/sprites)은 그대로, 코드로 그린 것은 변형·흔적을 얹는다
  _tile(kind, id, v, art) {
    const key = `${kind}_${id}_${v}`;
    if (this.cache.has(key)) return this.cache.get(key).canvas;
    if (this.images[key]) return this._build(key, 16, 16, () => {}).canvas;
    const [c, g] = makeCanvas(16, 16);
    art(pen(g), v);
    const out = weatherTile(c, kind, id, v);
    this.cache.set(key, { canvas: out, tall: 0 });
    return out;
  },
  floor(id, v = 0) { return this._tile('floor', id, v, (P, v) => FLOOR_ART[id](P, v)); },
  wall(id, v = 0) { return this._tile('wall', id, v, (P, v) => WALL_ART[id](P, v)); },
  ceil(id, v = 0) { return this._tile('ceil', id, v, (P, v) => CEIL_ART[id](P, v)); },
  street(v = 0) { return this._tile('street', 'cobble_street', v, (P, v) => streetArt(P, v)); },
  // 칸 좌표로 변형 번호 고르기
  variant(x, y) { return Math.floor(hash(x, y, 1) * TILE_VARIANTS); },
  icon(id) { return this._build(`icon_${id}`, 9, 9, P => drawIcon(P, id)).canvas; },

  object(id) {
    const def = DATA.objects[id], art = OBJ_ART[id];
    const key = `obj_${id}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const w = def.w * 16, h = def.h * 16;
    // 외부 이미지: 가로 중앙, 바닥 정렬 (xoff 는 음수일 수 있음)
    const ext = this.images[key] || (def.naple && this.prop(def.naple));
    if (ext) {
      const e = { canvas: ext, tall: Math.max(0, ext.height - h), xoff: Math.floor((w - ext.width) / 2), yfix: Math.min(0, ext.height - h) * -1 };
      this.cache.set(key, e); return e;
    }
    const tall = art ? art.tall : 0;
    const [c, g] = makeCanvas(w, h + tall);
    if (art) art.draw(pen(g)); else pen(g).box(1, 1 + tall, w - 2, h - 2, '#f0f');
    const e = { canvas: c, tall, xoff: 0, yfix: 0 };
    this.cache.set(key, e);
    return e;
  },

  // 90° 돌린 오브젝트 그림 (세로로 놓인 소파·카운터 등)
  objectRot(id) {
    const k = 'objrot_' + id;
    if (!this.cache.has(k)) {
      const src = this.object(id).canvas, [c, g] = makeCanvas(src.height, src.width);
      g.translate(src.height, 0); g.rotate(Math.PI / 2); g.drawImage(src, 0, 0);
      this.cache.set(k, c);
    }
    return this.cache.get(k);
  },

  // 반환: { canvas, ax, ay, sheet } — (ax, ay) 는 발 밑 중앙 기준점
  // state: 'idle' | 'walk' | 'sit' | 'act'
  customer(type, state, frame, face = 'down') {
    const sitting = state === 'sit' || state === 'act';
    if (this.hasChar(type.id)) {
      const col = state === 'walk' ? 2 + frame % 4 : state === 'sit' ? 6 : state === 'act' ? 7 : frame % 2;
      return { canvas: this.charFrame(type.id, face, col), ax: 16, ay: 32, sheet: true };
    }
    const key = `cust_${type.id}_${sitting ? 's' : 'w'}${sitting ? 0 : frame % 2}`;
    return { canvas: this._build(key, 14, 24, P => drawCustomerArt(P, type, sitting, frame)).canvas, ax: 7, ay: 24 };
  },

  robot(model, frame, face = 'down') {
    return this._build(`robot_${model}_${face}_${frame % 4}`, 16, 24, P => drawRobotArt(P, model, frame, face)).canvas;
  },
  cat(kind, pose, frame) {
    const k = DATA.cats.find(c => c.id === kind);
    return this._build(`cat_${kind}_${pose}_${pose === 'walk' ? frame % 2 : 0}`, 18, 12, P => drawCatArt(P, k, pose, frame)).canvas;
  },

  // UI 썸네일용: 스프라이트를 정수배 확대해서 새 캔버스로
  thumb(kind, id, size = 40) {
    let src;
    if (kind === 'floor') src = this.floor(id);
    else if (kind === 'wall') src = this.wall(id);
    else if (kind === 'ceil') src = this.ceil(id);
    else if (kind === 'icon') src = this.icon(id);
    else if (kind === 'kenney') src = this.kenney(id);
    else if (kind === 'char') src = this.charFrame(id, 'down', 0);
    else if (kind === 'player') src = this.playerFrame(id);
    else if (kind === 'cat') src = this.cat(id, 'sit', 0);
    else if (kind === 'robot') src = this.robot(id, 0);
    else if (kind === 'uniform') { const [cid, hue] = id.split('|'); src = this.charTint(cid, 'down', 0, +hue); }
    else src = this.object(id).canvas;
    const scale = Math.max(1, Math.floor(size / Math.max(src.width, src.height)));
    const [c, g] = makeCanvas(src.width * scale, src.height * scale);
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    c.className = 'pix';
    return c;
  },
};
