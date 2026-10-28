#!/usr/bin/env python3
"""tools/i18n/en_*.json 을 합쳐 js/i18n_en.js (I18N_EN 사전) 로 만든다.
번역을 고치거나 새 문자열을 넣은 뒤 실행:  python3 tools/i18n/extract.py && python3 tools/i18n/build.py"""
import json, pathlib, html
D = pathlib.Path(__file__).resolve().parent
ROOT = D.parents[1]
d = {}
for f in sorted(D.glob('en_*.json')): d.update(json.loads(f.read_text(encoding='utf-8')))
d = {html.unescape(k): html.unescape(v) for k, v in d.items()}
src = [e['ko'] for e in json.loads((D / 'source.json').read_text(encoding='utf-8'))]
miss = [k for k in src if html.unescape(k) not in d]
if miss: print('번역 없음', len(miss), ':', *miss[:30], sep='\n  ')
(ROOT / 'js/i18n_en.js').write_text('// 자동 생성 (tools/i18n/build.py) — 직접 고치지 말고 tools/i18n/en_*.json 을 고칠 것\nconst I18N_EN = '
    + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(len(d), 'entries →', 'js/i18n_en.js')
