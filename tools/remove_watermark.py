"""생성 이미지 우하단 반짝이 워터마크 지우기: 주변보다 밝은 무채색 덩어리를 찾아 바깥에서 안으로 채운다.
사용: python3 tools/remove_watermark.py 원본 결과 미리보기.png"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, dst, prev = sys.argv[1:4]
im = np.asarray(Image.open(src).convert('RGB')).astype(float)
H, W = im.shape[:2]
x0, y0 = W - 200, H - 190
reg = im[y0:, x0:]
lum = reg.mean(2); sat = reg.max(2) - reg.min(2)
# 주변(큰 블러)보다 확 밝고 채도 낮은 곳
bl = ndimage.uniform_filter(lum, 41)
m = (lum - bl > 18) & (sat < 45) & (lum > 95)
lab, n = ndimage.label(ndimage.binary_closing(m, iterations=3))
sizes = ndimage.sum(m, lab, range(1, n + 1))
k = int(np.argmax(sizes)) + 1
mask = ndimage.binary_dilation(ndimage.binary_fill_holes(lab == k), iterations=3)
ys, xs = np.where(mask)
print('sparkle', x0 + xs.min(), y0 + ys.min(), x0 + xs.max(), y0 + ys.max(), int(mask.sum()))
full = np.zeros((H, W), bool); full[y0:, x0:] = mask
out = im.copy(); known = ~full
for _ in range(200):
    if known.all():
        break
    acc = np.zeros_like(out); cnt = np.zeros((H, W))
    for dy, dx in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]:
        sh = np.roll(np.roll(out, dy, 0), dx, 1); kn = np.roll(np.roll(known, dy, 0), dx, 1)
        acc += sh * kn[..., None]; cnt += kn
    new = (~known) & (cnt >= 3)
    out[new] = acc[new] / cnt[new][:, None]; known |= new
out[full] += np.random.default_rng(1).normal(0, 5, (full.sum(), 3))
res = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
res.save(dst, quality=90)
res.crop((W - 300, H - 216, W, H)).resize((600, 432), Image.NEAREST).save(prev)
