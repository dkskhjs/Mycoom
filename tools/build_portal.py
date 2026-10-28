#!/usr/bin/env python3
"""Poki / CrazyGames 업로드용 빌드.

    python3 tools/build_portal.py            # 둘 다
    python3 tools/build_portal.py poki       # 하나만

결과: dist/<portal>/ 폴더와 dist/steambeans-<portal>.zip (zip 맨 위에 index.html).
포털 빌드에서 바꾸는 것
- 로그인(Firebase)·서비스 워커·홈 화면 앱(manifest) 관련 태그를 뺀다 (포털은 외부 요청과 외부 링크를 막는다)
- window.PORTAL 과 해당 포털 SDK 를 넣는다 → js/portal.js 가 광고·로딩·플레이 신호를 보낸다
"""
import re, shutil, sys, zipfile, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SDK = {
    'poki': 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
    'crazygames': 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
}
SKIP_FILES = {'js/firebase-init.js', 'assets/README.md', 'assets/bg/README.md'}

def build(portal):
    out = ROOT / 'dist' / portal
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)
    for d in ['css', 'js', 'assets']:
        for f in (ROOT / d).rglob('*'):
            rel = f.relative_to(ROOT).as_posix()
            if f.is_dir() or rel in SKIP_FILES or '/_' in rel: continue
            (out / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, out / rel)
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = re.sub(r'\s*<!-- Firebase SDK[^>]*-->', '', html)
    html = re.sub(r'\s*<script src="https://www\.gstatic\.com/firebasejs/[^"]+"></script>', '', html)
    html = re.sub(r'\s*<script src="js/firebase-init\.js[^"]*"></script>', '', html)
    html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)
    html = re.sub(r'\s*<meta name="(apple-mobile-web-app-[a-z-]+|mobile-web-app-capable)"[^>]*>', '', html)
    head = f'\n<script>window.PORTAL = {portal!r};</script>\n<script src="{SDK[portal]}"></script>'
    html = html.replace('</title>', '</title>' + head, 1)
    (out / 'index.html').write_text(html, encoding='utf-8')
    z = ROOT / 'dist' / f'steambeans-{portal}.zip'
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(out.rglob('*')):
            if f.is_file(): zf.write(f, f.relative_to(out).as_posix())
    files = [f for f in out.rglob('*') if f.is_file()]
    size = sum(f.stat().st_size for f in files)
    audio = sum(f.stat().st_size for f in files if f.suffix == '.mp3')
    print(f'{portal:11s} 파일 {len(files)}개 · 전체 {size/1e6:.1f}MB (배경음악 {audio/1e6:.1f}MB, 첫 로딩은 음악 제외 약 {(size-audio)/1e6:.1f}MB) → {z.relative_to(ROOT)}')

for p in (sys.argv[1:] or SDK):
    build(p)
