#!/usr/bin/env python3
"""js/*.js 와 index.html 에서 한글이 들어간 문자열을 뽑아 tools/i18n/source.json 으로.
템플릿 문자열의 ${...} 는 {0} {1} … 자리표시로 바꾼다 (중첩 템플릿은 따로 뽑힘)."""
import re, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
HAN = re.compile(r'[가-힣]')
out = {}

def add(s, where):
    s = s.strip('\n')
    if HAN.search(s): out.setdefault(s, where)

def scan_js(src, where):
    i, n = 0, len(src)
    def read_template(i):
        # i 는 여는 ` 다음. 반환: (문자열, 끝 다음 위치)
        parts, cur, k = [], '', 0
        while i < n:
            c = src[i]
            if c == '\\': cur += src[i:i+2]; i += 2; continue
            if c == '`': parts.append(cur); return ''.join(parts), i + 1
            if c == '$' and i + 1 < n and src[i+1] == '{':
                # ${ ... } 건너뛰며 안쪽 문자열도 뽑기
                depth, j = 1, i + 2
                start = j
                while j < n and depth:
                    cj = src[j]
                    if cj in '\'"': q, j = read_quoted(j + 1, cj); add(q.replace("\\'", "'").replace('\\n', '\n'), where); continue
                    if cj == '`': inner, j = read_template(j + 1); add(inner, where); continue
                    if cj == '{': depth += 1
                    elif cj == '}': depth -= 1
                    j += 1
                cur += '{%d}' % k; k += 1; i = j; continue
            cur += c; i += 1
        return cur, i
    def read_quoted(i, q):
        s = ''
        while i < n:
            c = src[i]
            if c == '\\': s += src[i:i+2]; i += 2; continue
            if c == q: return s, i + 1
            if c == '\n': return s, i
            s += c; i += 1
        return s, i
    while i < n:
        c = src[i]
        if src.startswith('//', i): i = src.find('\n', i); i = n if i < 0 else i; continue
        if src.startswith('/*', i): i = src.find('*/', i) + 2; continue
        if c in '\'"': s, i = read_quoted(i + 1, c); add(s.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n'), where); continue
        if c == '`': s, i = read_template(i + 1); add(s.replace('\\n', '\n').replace('\\`', '`'), where); continue
        if c == '/' and re.match(r'[=(,:!&|?{};\[]\s*$', src[max(0, i-20):i].rstrip()[-1:] or '('):
            # 정규식 리터럴 건너뛰기
            j = i + 1
            while j < n and src[j] != '/' and src[j] != '\n':
                if src[j] == '\\': j += 1
                elif src[j] == '[':
                    while j < n and src[j] != ']': j += 1
                j += 1
            i = j + 1; continue
        i += 1

for f in sorted((ROOT / 'js').glob('*.js')):
    if f.name in ('naple_atlas.js', 'i18n.js', 'i18n_en.js'): continue
    scan_js(f.read_text(encoding='utf-8'), f.name)
# index.html 정적 텍스트
html = (ROOT / 'index.html').read_text(encoding='utf-8')
for m in re.finditer(r'>([^<>]*[가-힣][^<>]*)<', html): add(m.group(1).strip(), 'index.html')
for m in re.finditer(r'(?:title|placeholder)="([^"]*[가-힣][^"]*)"', html): add(m.group(1), 'index.html')
# 코드 주석이 섞여 들어온 것 같은 아주 긴 줄 제외는 하지 않음 — 번역 단계에서 확인
items = [{'ko': k, 'file': v} for k, v in out.items()]
(ROOT / 'tools/i18n/source.json').write_text(json.dumps(items, ensure_ascii=False, indent=0), encoding='utf-8')
print(len(items), 'strings')
from collections import Counter
print(Counter(i['file'] for i in items))
