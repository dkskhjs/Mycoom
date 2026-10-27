# 에셋 가이드

모든 그래픽은 **16px 타일** 기준 도트입니다. 화면에서는 정수배(nearest-neighbor)로 확대됩니다.
이미지가 없으면 코드로 그린 임시 도트가 나오므로, 만든 것부터 하나씩 끼워 넣으면 됩니다.

## 1. 캐릭터 시트 (`assets/chars/<id>.png`)

| 항목 | 규격 |
| --- | --- |
| 프레임 | 32×32 px, 투명 배경 PNG |
| 시트 | 8열 × 3행 = **256×96 px** |
| 열 | 0–1 대기, 2–5 걷기, 6 앉기, 7 동작 (주인공=쟁반 내밀기, 손님=마시기) |
| 행 | 0 정면(아래를 봄), 1 뒷면(위를 봄), 2 옆모습(오른쪽을 봄 — 왼쪽은 게임이 좌우 반전) |
| 기준점 | 발 밑 중앙 = (16, 31). 몸은 대략 가운데 16×24 안 (어른 기준, 아이는 16×18) |
| 외곽선 | 1px 진한 갈색/검정 외곽선, 안티앨리어싱 없음 |

`assets/chars/_guide_x4.png`가 4배 확대한 칸 안내도입니다 (초록 = 권장 몸 영역, 빨강 = 발 기준점).

넣은 뒤 `assets/manifest.js`의 `CHAR_MANIFEST`에 id를 추가하세요.

| id | 캐릭터 | id | 캐릭터 |
| --- | --- | --- | --- |
| `hero_m` | 주인공 (남) | `hero_f` | 주인공 (여) |
| `adult_m` | 시민 (남) | `adult_f` | 시민 (여) |
| `elder_m` | 노신사 | `elder_f` | 노부인 |
| `child_m` | 꼬마 (남) | `child_f` | 꼬마 (여) |
| `miner_m` | 광부 (남) | `miner_f` | 광부 (여) |
| `smith_m` | 대장장이 (남) | `smith_f` | 대장장이 (여) |
| `engineer_m` | 기관사 (남) | `engineer_f` | 기관사 (여) |
| `aviator_m` | 비행사 (남) | `aviator_f` | 비행사 (여) |
| `plumber_m` | 배관공 (남) | `plumber_f` | 배관공 (여) |
| `noble_m` | 귀족 (남, VIP) | `noble_f` | 귀족 (여, VIP) |

### 이미지 생성 프롬프트

생성 모델은 정확한 32px 격자를 잘 못 맞추므로 **크게 뽑은 뒤 도트 격자로 다시 샘플링**하는 흐름을 권장합니다
(NAPLE 저장소에서 `source.webp` → `*_clean.png` 만든 방식과 같음).

1. 아래 **공통 스타일** + **캐릭터 설명**을 붙여서 생성
2. 한 장에 캐릭터 하나, 3방향 턴어라운드(정면/뒷면/옆) + 걷기 포즈가 나오게
3. 도트 1칸 크기를 재서 nearest로 축소 → 배경 제거 → 32×32 칸에 맞춰 배치

**공통 스타일 (모든 캐릭터 앞에 붙임)**

```
pixel art character sprite sheet, 32x32 pixel frames, chibi proportions (2 heads tall),
steampunk Victorian city, warm limited palette (brass, copper, mahogany, soot black, cream),
1px dark brown outline, no anti-aliasing, flat shading with 2-3 tones per color,
top-down 3/4 RPG view like Stardew Valley,
three rows: front view, back view, side view facing right;
each row: 2 idle frames, 4 walk-cycle frames, 1 sitting pose, 1 action pose;
transparent background, evenly spaced grid, same character in every frame, consistent proportions
```

**주인공**

- `hero_m` — `young male cafe owner and barista, short messy chestnut hair, brass-rimmed goggles pushed up on forehead, white rolled-up shirt, dark brown leather apron with brass buckles, copper pocket watch chain, rolled sleeves, friendly smile; action pose: holding a silver serving tray with a steaming coffee cup`
- `hero_f` — `young female cafe owner and barista, auburn hair in a high bun with a brass hairpin gear, brass goggles on forehead, cream blouse with puffed sleeves, dark brown leather corset-style apron with brass buckles, long dark skirt and lace-up boots, friendly smile; action pose: holding a silver serving tray with a steaming coffee cup`

**NPC (남/여 짝)**

- `adult_m` — `ordinary adult male townsperson, brown flat cap, tweed waistcoat over white shirt, brown trousers, short beard`
- `adult_f` — `ordinary adult female townsperson, small feathered hat, mauve bustle dress with high collar, shawl, carrying a small handbag`
- `elder_m` — `elderly gentleman, white mustache and side whiskers, short black top hat, long grey frock coat, walking cane with brass handle, monocle, slightly hunched`
- `elder_f` — `elderly lady, silver hair in a bun, lace bonnet, lavender dress with cameo brooch, round spectacles, knitted shawl, slightly hunched`
- `child_m` — `small boy, about 8 years old, shorter body (fits in 16x18 pixels), newsboy cap, oversized suspenders, short trousers, knee socks, freckles, holding a toy brass gear`
- `child_f` — `small girl, about 8 years old, shorter body (fits in 16x18 pixels), twin braids with ribbons, mustard pinafore dress over white blouse, little goggles on headband, holding a wind-up toy bird`
- `miner_m` — `coal miner man, soot-smudged face, brass miner helmet with lamp, dark canvas jacket, suspenders, heavy boots, pickaxe on back`
- `miner_f` — `coal miner woman, soot-smudged face, brass miner helmet with lamp, rolled-up sleeves, canvas overalls, scarf tied around neck, pickaxe on back`
- `smith_m` — `burly blacksmith man, bald head, thick black beard, bare muscular arms, scorched leather apron, heavy gloves, hammer hanging from belt`
- `smith_f` — `strong blacksmith woman, short red hair tied back, freckles, sleeveless shirt, scorched leather apron, thick leather gloves, tongs on belt`
- `engineer_m` — `steam engine engineer man, oil-stained navy coveralls, brass goggles over eyes, big wrench in hand, tool belt with gauges`
- `engineer_f` — `steam engine engineer woman, oil-stained teal coveralls with rolled sleeves, brass goggles on head, ponytail, wrench in hand, tool belt`
- `aviator_m` — `airship pilot man, brown leather aviator cap with flaps, flight goggles, sheepskin-collared bomber jacket, long white scarf, brass compass on chest`
- `aviator_f` — `airship pilot woman, blonde curls under leather aviator cap, flight goggles, cropped leather jacket, long red scarf, high boots, brass compass on chest`
- `noble_m` — `wealthy aristocrat man, tall black top hat, deep purple velvet tailcoat, gold waistcoat, cravat with ruby pin, white gloves, gold-tipped cane, haughty expression`
- `noble_f` — `wealthy aristocrat lady, small tilted top hat with veil and feathers, navy velvet bustle gown with gold trim, lace parasol, pearl necklace, haughty expression`

> 팁: 같은 직업의 남/여를 한 번에 뽑으면 색감이 맞습니다 (`two characters side by side: ... and ...`).
> 생성 모델이 시트 배치를 틀리게 하면, 정면 1장만 깔끔하게 뽑아서 Aseprite 등에서 나머지 프레임을 그리는 쪽이 빠릅니다.

### AI 생성 시트 가져오기 (`tools/import_chars.py`)

체크무늬가 그림에 박힌 생성 이미지를 게임 시트로 바꿉니다 (numpy, Pillow, scipy 필요).

```sh
# 1) 배경 제거 + 프레임 잘라 번호 붙이기 → <작업폴더>/_index.png 로 번호 확인
python3 tools/import_chars.py extract 원본.webp 작업폴더
#    프레임끼리 붙어 있으면(양산 등) 영역별 칸 수를 준다: x0:x1:칸수
python3 tools/import_chars.py extract 원본.webp 작업폴더 0:990:6 1010:2000:6
# 2) tools/char_map.json 에 방향별 프레임 번호 적고 시트 만들기 (번호 뒤 f = 좌우 반전)
python3 tools/import_chars.py build tools/char_map.json
```

축소할 때 블록마다 가장 많은 색을 고르되 눈·입 같은 어두운 디테일은 우선 살리고, 팔레트를 28색으로 줄인 뒤
실루엣 가장자리를 어둡게 해 외곽선을 만듭니다. 생성 이미지 특성상 얼굴은 손으로 1~2px 다듬으면 훨씬 좋아집니다.

들어간 시트: `adult_m`, `adult_f`, `aviator_m`, `aviator_f`, `noble_m`, `noble_f`
(시민 남은 원본에 앉기·마시기 프레임이 없어 서 있는 프레임 아래를 잘라 앉은 자세를 합성)

배경: `assets/bg/town_clear.webp` (워터마크는 `tools/remove_watermark.py` 로 지움). 눈 버전 `town_snow.*` 대기 중.

## 2. 오브젝트·타일 교체 (`assets/sprites/<키>.png`)

넣은 뒤 `assets/manifest.js`의 `ASSET_MANIFEST`에 키를 추가하세요.

- **바닥/벽/천장**: 16×16. 키 `floor_<id>_0`, `floor_<id>_1`(변형 2종), `wall_<id>_0`, `wall_<id>_1`, `ceil_<id>`
  - 바닥 id: `dirt plank herring checker brassgrid carpet marble`
  - 벽 id: `rawbrick redbrick woodpanel damask rivet verdigris stained`
  - 천장 id: `beams plaster tin copper glassdome`
- **오브젝트**: 키 `obj_<id>`. 가로 = 칸 수×16, 세로는 자유 (위로 솟은 부분 포함, 바닥 정렬)
  - 예: 보일러 `obj_boiler` 32×46, 에스프레소 머신 `obj_espresso` 16×25
  - id 목록: `js/data.js`의 `objects`
- 레시피 아이콘: 9×9, 키 `icon_<레시피 id>`

## 3. NAPLE 저장소에서 가져온 것 (`assets/naple/`)

사용자 요청으로 NAPLE의 **그래픽과 BGM만** 가져왔습니다 (효과음, 코드는 쓰지 않음).

| 파일 | 쓰는 곳 |
| --- | --- |
| `props_atlas.png` | 장식(꽃 화분, 나무통, 상자, 보관함, 관목, 꽃덤불, 톱니 오브제, 푸른 화로), 거리(가로등, 벤치, 간판, 덤불) — 조각 좌표는 `js/naple_atlas.js` |
| `player_sheet.png` | 주인공 시트가 오기 전까지 바리스타 대역 |
| `kenney_tilemap.png` | 동전 아이콘, 만족도 하트, 눈 오는 날 눈사람 (Kenney Pixel Platformer, CC0 — `kenney_License.txt`) |
| `bgm/*.mp3` | 장면별 BGM (`js/audio.js`) |

BGM 배정: 타이틀 `the_map_unfolds` · 영업 준비 `first_light_in_the_valley` · 낮 영업 `path_to_the_great_oak` ·
저녁 영업 `lanterns_in_the_canopy` · 눈보라 `under_permafrost` · 보일러 위기 `halls_of_permafrost`

폰트: Galmuri (OFL-1.1, `assets/fonts/LICENSE.txt`)
