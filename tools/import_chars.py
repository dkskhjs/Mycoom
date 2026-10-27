"""AI 생성 캐릭터 시트(체크무늬 배경이 그림에 박힌 이미지) → 게임용 도트 시트.

사용법:
  1) 프레임 뽑기 + 번호 붙은 확인용 시트:
       python3 tools/import_chars.py extract <원본 이미지> <작업폴더> [x0:x1:칸수 ...]
     프레임끼리 붙어 있으면(양산 등) 영역별 칸 수를 주면 격자로 자른다.
  2) 프레임 번호를 게임 규격(정면/뒷면/옆 × 대기2·걷기4·앉기·동작)에 배치:
       python3 tools/import_chars.py build tools/char_map.json
     매핑 예: {"aviator_m": {"work": "...", "down": [0,1, 0,2,1,3, 4,5], "up": [...], "side": ["24f","24f", 26,27,26,27, 28,29]}}
     번호 뒤 f = 좌우 반전, s = 앉은 자세 합성(앉기 프레임이 없을 때). 옆모습은 오른쪽을 보게 맞춘다.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

FRAME = 32          # 출력 프레임 크기
BODY_H = 30         # 서 있는 어른 키(도트). 프레임 안에서 발끝 = 31


def background_mask(a):
    """체크무늬(밝은 무채색 두 톤)와 바닥 그라데이션 띠를 배경으로 본다."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    sat, lum = mx - mn, (r + g + b) / 3
    cand = ((sat < 14) & (lum > 135)) | ((sat < 28) & (lum > 85) & (lum < 175) & (b >= r))
    # 가장자리와 이어진 배경
    lab, n = ndimage.label(cand)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # 갇힌 체크 칸(팔과 몸 사이 등): 체크 두 톤에만 해당하고 충분히 큰 영역
    tones = np.unique(np.round(lum[bg & (sat < 6)] / 4) * 4, return_counts=True)
    top = tones[0][np.argsort(tones[1])[-2:]]
    near = np.zeros(lum.shape, bool)
    for t in top:
        near |= (np.abs(lum - t) < 7) & (sat < 8)
    lab2, n2 = ndimage.label(near & ~bg)
    sizes = ndimage.sum(np.ones_like(lab2), lab2, range(1, n2 + 1))
    for i, sz in enumerate(sizes, 1):
        if sz > 120:
            bg |= lab2 == i
    # 시트를 가르는 검은 세로줄도 배경
    dark = lum < 40
    cols = np.where(dark.mean(0) > 0.6)[0]
    for c in cols:
        bg[:, max(0, c - 2):c + 3] |= dark[:, max(0, c - 2):c + 3] | (lum[:, max(0, c - 2):c + 3] < 90)
    return bg


def split_points(proj, lo, hi, n):
    """[lo, hi) 를 n 칸으로: 균등 경계 근처(±30%)에서 전경이 가장 적은 곳을 자른다."""
    pts = [lo]
    step = (hi - lo) / n
    for k in range(1, n):
        c = int(lo + step * k)
        r = int(step * 0.3)
        seg = proj[c - r:c + r]
        pts.append(c - r + int(np.argmin(seg)))
    pts.append(hi)
    return pts


def extract_grid(a, fg, regions):
    """regions: [(x0, x1, cols[, rows])] — 각 영역을 줄 × cols 칸으로 자른다.
    rows 를 주면 줄도 균등 분할(위아래로 붙은 시트용), 아니면 가로 빈 띠로 줄을 찾는다."""
    boxes = []
    for reg in regions:
        x0, x1, cols = reg[:3]
        rp = fg[:, x0:x1].sum(1)
        on = rp > 3
        bands, y = [], 0
        if len(reg) > 3:
            ys = np.where(on)[0]
            rpts = split_points(rp.astype(float), int(ys.min()), int(ys.max()) + 1, reg[3])
            bands = list(zip(rpts[:-1], rpts[1:]))
        while not bands and y < len(on):
            if on[y]:
                y2 = y
                while y2 < len(on) and on[y2]:
                    y2 += 1
                if y2 - y >= 150:
                    bands.append((y, y2))
                y = y2
            else:
                y += 1
        for (y0, y1) in bands:
            cp = fg[y0:y1].sum(0).astype(float)
            pts = split_points(cp, x0, x1, cols)
            for c in range(cols):
                m = fg[y0:y1, pts[c]:pts[c + 1]]
                lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=4))
                if not n:
                    continue
                sizes = ndimage.sum(m, lab, range(1, n + 1))
                if sizes.max() < 1500:      # 빈 칸
                    continue
                keep = lab == (int(np.argmax(sizes)) + 1)
                ys, xs = np.where(keep & m)
                boxes.append((y0 + ys.min(), pts[c] + xs.min(), ys.max() - ys.min() + 1, xs.max() - xs.min() + 1,
                              (keep & m)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]))
    return boxes


def extract(src, out, grid=None):
    os.makedirs(out, exist_ok=True)
    img = Image.open(src).convert('RGB')
    a = np.asarray(img)
    fg = ~background_mask(a)
    fg = ndimage.binary_opening(fg, iterations=2)
    boxes = []
    if grid:
        boxes = extract_grid(a, fg, grid)
    else:
        lab, n = ndimage.label(ndimage.binary_dilation(fg, iterations=6))
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if h < 150 or w < 60:      # 글자·워터마크·부스러기 제외
                continue
            boxes.append((sl[0].start, sl[1].start, h, w, (lab[sl] == i) & fg[sl]))
        # 줄 → 칸 순서로 정렬
        boxes.sort(key=lambda b: (round(b[0] / 150), b[1]))
    rgba = np.dstack([a, (fg * 255).astype(np.uint8)])
    frames = []
    for k, (y, x, h, w, m) in enumerate(boxes):
        crop = rgba[y:y + h, x:x + w].copy()
        crop[..., 3] = m * 255
        Image.fromarray(crop).save(f'{out}/f{k:02d}.png')
        frames.append({'i': k, 'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)})
    json.dump(frames, open(f'{out}/frames.json', 'w'), indent=1)
    # 확인용: 번호 붙은 축소본
    sheet = img.copy().convert('RGB')
    d = ImageDraw.Draw(sheet)
    for f in frames:
        d.rectangle([f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']], outline=(255, 0, 255), width=3)
        d.rectangle([f['x'], f['y'], f['x'] + 46, f['y'] + 30], fill=(255, 0, 255))
        d.text((f['x'] + 4, f['y'] + 2), str(f['i']), fill=(255, 255, 255), font_size=26)
    sheet.thumbnail((1400, 1400))
    sheet.save(f'{out}/_index.png')
    print(f'{len(frames)} frames →', out)


def downscale(im, scale):
    """도트 느낌을 살리는 축소: 블록마다 가장 많은 색(최빈값)을 고른다."""
    a = np.asarray(im)
    H, W = a.shape[:2]
    oh, ow = max(1, round(H * scale)), max(1, round(W * scale))
    out = np.zeros((oh, ow, 4), np.uint8)
    ys = np.linspace(0, H, oh + 1).astype(int)
    xs = np.linspace(0, W, ow + 1).astype(int)
    for j in range(oh):
        for i in range(ow):
            blk = a[ys[j]:ys[j + 1], xs[i]:xs[i + 1]].reshape(-1, 4)
            vis = blk[blk[:, 3] > 128]
            if len(vis) < len(blk) * 0.45:
                continue
            # 눈·입·외곽선 같은 어두운 디테일은 블록의 22%만 넘어도 살린다
            lum = vis[:, :3].astype(int).sum(1) / 3
            dark = vis[lum < 70]
            if len(dark) >= len(vis) * 0.22:
                out[j, i, :3] = np.median(dark[:, :3], axis=0)
                out[j, i, 3] = 255
                continue
            q = (vis[:, :3] // 24).astype(int)
            key = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
            vals, cnt = np.unique(key, return_counts=True)
            sel = vis[key == vals[np.argmax(cnt)], :3]
            out[j, i, :3] = np.median(sel, axis=0)
            out[j, i, 3] = 255
    return crisp(Image.fromarray(out))


def crisp(im, colors=28):
    """축소 뒤 정리: 팔레트를 줄여 잡색을 없애고, 실루엣 가장자리 1px 을 어둡게 해 외곽선을 살린다."""
    a = np.asarray(im).copy()
    op = a[..., 3] > 0
    if op.sum() == 0:
        return im
    rgb = Image.fromarray(a[..., :3]).quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert('RGB')
    q = np.asarray(rgb).copy()
    a[..., :3] = np.where(op[..., None], q, a[..., :3])
    pad = np.pad(op, 1)
    edge = op & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    a[edge, :3] = (a[edge, :3].astype(float) * 0.42 + np.array([20, 10, 6]) * 0.58).astype(np.uint8)
    return Image.fromarray(a)


def build(mapping_path):
    """매핑의 각 항목: work(작업폴더), down/up/side (8칸: 대기2·걷기4·앉기·동작).
    프레임 번호 뒤에 f 를 붙이면 좌우 반전 (예: "24f"). size 로 키 보정 (모자·깃털 등)."""
    mapping = json.load(open(mapping_path))
    for cid, m in mapping.items():
        work = m['work']
        frames = json.load(open(f'{work}/frames.json'))
        # 접미사: f = 좌우 반전, s = 앉은 자세 합성(다리 아래 30%를 잘라 의자에 앉은 것처럼)
        ids = lambda v: (int(str(v).rstrip('fs')), 'f' in str(v)[-2:].lstrip('0123456789'), str(v).endswith('s'))
        ref = [frames[ids(v)[0]]['h'] for v in m['down'][:2]]
        scale = BODY_H / float(np.median(ref)) * m.get('size', 1.0)
        sheet = Image.new('RGBA', (FRAME * 8, FRAME * 3), (0, 0, 0, 0))
        cache = {}
        for r, face in enumerate(['down', 'up', 'side']):
            for c, v in enumerate(m[face]):
                idx, flip, sit = ids(v)
                if (idx, flip, sit) not in cache:
                    im = Image.open(f'{work}/f{idx:02d}.png')
                    if flip:
                        im = im.transpose(Image.FLIP_LEFT_RIGHT)
                    if sit:
                        im = im.crop((0, 0, im.width, int(im.height * 0.72)))
                    cache[(idx, flip, sit)] = downscale(im, scale)
                sp = cache[(idx, flip, sit)]
                if sp.height > FRAME:
                    sp = sp.crop((0, sp.height - FRAME, sp.width, sp.height))
                # 발끝(아래) 정렬, 가로 가운데
                x = c * FRAME + (FRAME - sp.width) // 2
                y = r * FRAME + FRAME - sp.height
                sheet.alpha_composite(sp, (max(c * FRAME, x), y))
        os.makedirs('assets/chars', exist_ok=True)
        sheet.save(f'assets/chars/{cid}.png')
        sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(f'{work}/{cid}_x4.png')
        print(cid, f'scale={scale:.3f}', '→ assets/chars/' + cid + '.png')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'extract':
        # 선택: x0:x1:칸수 를 여러 개 주면 격자로 자른다 (붙어 있는 프레임용)
        grid = [tuple(int(v) for v in g.split(':')) for g in sys.argv[4:]] or None
        extract(sys.argv[2], sys.argv[3], grid)
    elif cmd == 'build':
        build(sys.argv[2])
