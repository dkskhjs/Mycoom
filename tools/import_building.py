"""생성한 건물 그림(체크무늬 배경) → 게임용 도트 건물 스프라이트.

사용법: python3 tools/import_building.py <원본 이미지> <id> <가로 칸 수>
결과: assets/buildings/<id>.png (가로 = 칸 수 × 16px, 바닥 정렬). manifest.js 의 BUILDING_MANIFEST 에 id 추가.
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from import_chars import background_mask, crisp

src, bid, tiles = sys.argv[1], sys.argv[2], int(sys.argv[3])
a = np.asarray(Image.open(src).convert('RGB'))
fg = ~background_mask(a)
fg = ndimage.binary_opening(fg, iterations=2)
lab, n = ndimage.label(ndimage.binary_dilation(fg, iterations=3))
sizes = ndimage.sum(fg, lab, range(1, n + 1))
keep = lab == (int(np.argmax(sizes)) + 1)
# 건물 안의 구멍(창문 사이 등)은 채운다 — 건물은 속이 꽉 찬 덩어리
keep = ndimage.binary_fill_holes(keep) & (fg | ndimage.binary_fill_holes(keep))
ys, xs = np.where(keep)
crop = np.dstack([a, (keep * 255).astype(np.uint8)])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
im = Image.fromarray(crop)
scale = tiles * 16 / im.width
# 건물은 면 위주라 영역 평균(BOX)으로 줄여야 불빛·색이 산다. 알파는 반 이상 덮인 칸만.
w, h = round(im.width * scale), round(im.height * scale)
rgb = im.convert('RGB').resize((w, h), Image.BOX)
al = im.getchannel('A').resize((w, h), Image.BOX).point(lambda v: 255 if v >= 128 else 0)
small = rgb.convert('RGBA'); small.putalpha(al)
from PIL import ImageEnhance
small = ImageEnhance.Color(small).enhance(1.15)
small = ImageEnhance.Contrast(small).enhance(1.08)
out = crisp(small, colors=40)
os.makedirs('assets/buildings', exist_ok=True)
out.save(f'assets/buildings/{bid}.png')
print(bid, out.size, f'scale={scale:.3f}')
