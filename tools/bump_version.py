#!/usr/bin/env python3
"""index.html 의 js/css 링크에 ?v=<버전> 을 붙여, 배포할 때마다 브라우저·홈 화면 앱이 새 파일을 받게 한다.

사용: python3 tools/bump_version.py        (현재 시각으로)
      python3 tools/bump_version.py 42     (직접 지정)
"""
import re, sys, time, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
ver = sys.argv[1] if len(sys.argv) > 1 else time.strftime('%Y%m%d%H%M')
p = root / 'index.html'
s = p.read_text(encoding='utf-8')
s, n = re.subn(r'((?:src|href)="(?:js|css|assets)/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"', lambda m: f'{m.group(1)}?v={ver}"', s)
p.write_text(s, encoding='utf-8')
print(f'{n}개 링크 → v={ver}')
