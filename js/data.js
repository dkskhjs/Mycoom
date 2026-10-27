// 게임 데이터 정의 — 밸런스/콘텐츠는 대부분 여기서 조정한다.
const TILE = 16;           // 도트 1타일 = 16x16px (화면에선 정수배 확대)
const MIN_PER_SEC = 4;          // 배속 1일 때 실제 1초 = 게임 4분
const OPEN_HOUR = 8, CLOSE_HOUR = 20;
const STREET_ROWS = 3;          // 가게 앞 거리: 보도 1줄 + 차도 2줄

const DATA = {
  startMoney: 16000,

  // maxW/maxH: 확장 한계(벽 포함), expandBase: 첫 확장 공사비
  plots: [
    { id: 'alley',   name: '톱니골목 끝 빈터',   w: 12, h: 10, price: 3000, traffic: 0.8, maxW: 18, maxH: 14, expandBase: 2000,
      desc: '좁고 싸다. 유동인구가 적은 뒷골목.' },
    { id: 'canal',   name: '증기운하 옆 공터',   w: 14, h: 11, price: 5500, traffic: 1.0, maxW: 20, maxH: 15, expandBase: 2600,
      desc: '적당한 크기. 운하 노동자들이 지나다닌다.' },
    { id: 'airship', name: '비행선 정류장 앞',   w: 16, h: 12, price: 9000, traffic: 1.35, maxW: 24, maxH: 16, expandBase: 3200,
      desc: '넓고 비싸다. 여행객이 끊이지 않는다.' },
  ],

  // 바닥재 (타일당)
  floors: {
    dirt:       { name: '맨흙',          cost: 0,  appeal: 0, lv: 1 },
    plank:      { name: '거친 판자',      cost: 15, appeal: 1, lv: 1 },
    herring:    { name: '헤링본 원목',    cost: 35, appeal: 2, lv: 1 },
    checker:    { name: '흑백 체크 타일', cost: 40, appeal: 2, lv: 2 },
    brassgrid:  { name: '황동 격자 철판', cost: 55, appeal: 3, lv: 3 },
    carpet:     { name: '진홍 카펫',      cost: 50, appeal: 3, lv: 3 },
    marble:     { name: '대리석',         cost: 80, appeal: 4, lv: 5 },
    cobble:     { name: '자갈 포석',      cost: 18, appeal: 1, lv: 1 },
    brickfloor: { name: '헤링본 벽돌',    cost: 25, appeal: 1, lv: 1 },
    parquet:    { name: '쪽모이 원목',    cost: 45, appeal: 3, lv: 2 },
    hextile:    { name: '육각 타일',      cost: 50, appeal: 3, lv: 3 },
    steamgrate: { name: '증기 그레이팅',   cost: 60, appeal: 3, lv: 3 },
    rug:        { name: '페르시아 융단',   cost: 70, appeal: 4, lv: 4 },
    mosaic:     { name: '황동 모자이크',   cost: 95, appeal: 5, lv: 6 },
  },

  // 벽 마감재 (외곽 벽 타일당)
  walls: {
    rawbrick:   { name: '거친 벽돌',      cost: 0,  appeal: 0, lv: 1 },
    redbrick:   { name: '붉은 벽돌',      cost: 20, appeal: 1, lv: 1 },
    woodpanel:  { name: '마호가니 패널',   cost: 40, appeal: 2, lv: 1 },
    damask:     { name: '다마스크 벽지',   cost: 45, appeal: 2, lv: 2 },
    rivet:      { name: '리벳 철판',      cost: 50, appeal: 2, lv: 2 },
    verdigris:  { name: '녹청 구리판',     cost: 70, appeal: 3, lv: 4 },
    stained:    { name: '스테인드글라스 창', cost: 110, appeal: 4, lv: 5 },
    rustplate:  { name: '녹슨 철판',      cost: 25, appeal: 1, lv: 1 },
    stripe:     { name: '줄무늬 벽지',     cost: 35, appeal: 2, lv: 1 },
    subway:     { name: '흰 지하철 타일',  cost: 40, appeal: 2, lv: 2 },
    porthole:   { name: '현창 황동벽',     cost: 85, appeal: 3, lv: 3 },
    bookwall:   { name: '서가 벽',        cost: 80, appeal: 4, lv: 4 },
    gearwall:   { name: '톱니 장식 벽',    cost: 95, appeal: 4, lv: 5 },
  },

  // 천장 마감재 (실내 타일당)
  ceilings: {
    beams:      { name: '노출 서까래',     cost: 0,  appeal: 0, lv: 1 },
    plaster:    { name: '석고 천장',       cost: 12, appeal: 1, lv: 1 },
    tin:        { name: '주석 엠보 타일',  cost: 30, appeal: 2, lv: 2 },
    copper:     { name: '구리 패널',       cost: 45, appeal: 2, lv: 4 },
    glassdome:  { name: '유리 돔 채광창',  cost: 70, appeal: 3, lv: 5 },
    duct:       { name: '노출 덕트',       cost: 20, appeal: 1, lv: 1 },
    brassplate: { name: '황동 압착판',     cost: 50, appeal: 2, lv: 3 },
    coffered:   { name: '격자 우물천장',   cost: 55, appeal: 3, lv: 3 },
    gearceil:   { name: '톱니 천장',       cost: 65, appeal: 3, lv: 4 },
    fresco:     { name: '하늘 프레스코',   cost: 90, appeal: 4, lv: 6 },
  },

  // 배관 (타일당)
  pipes: {
    cold: { name: '급수관', cost: 15, color: '#4a8fc9', desc: '수도 인입구 → 보일러/싱크대' },
    hot:  { name: '급탕(증기)관', cost: 25, color: '#d0503a', desc: '보일러 → 에스프레소 머신/주전자/오븐/싱크대' },
    heat: { name: '바닥 온수난방관', cost: 20, color: '#e8a33a', desc: '보일러 → 바닥 아래. 깔린 칸이 따뜻해진다' },
  },

  // 배치 오브젝트
  // layer: 'floor'(바닥에 놓임) | 'ceil'(천장)
  // needs: 연결이 필요한 배관 종류
  objects: {
    boiler:     { name: '중앙 증기 보일러', cat: 'utility', w: 2, h: 2, cost: 2500, appeal: 2, lv: 1, needs: ['cold'], unique: true,
                  desc: '모든 증기의 심장. 급수관으로 물을 받고 석탄을 태운다.' },
    radiator:   { name: '주철 라디에이터', cat: 'utility', w: 1, h: 1, cost: 300, appeal: 1, lv: 1, needs: ['heat'],
                  desc: '난방관에 연결하면 주변 2칸을 데운다.' },
    automaton:  { name: '증기 오토마톤 조수', cat: 'utility', w: 1, h: 1, cost: 3500, appeal: 5, lv: 4, needs: ['hot'], unique: true,
                  desc: '완성된 음식을 자동으로 카운터로 옮긴다.' },

    espresso:   { name: '황동 에스프레소 머신', cat: 'kitchen', w: 1, h: 1, cost: 1800, appeal: 3, lv: 1, needs: ['cold', 'hot'], cook: true,
                  desc: '급수 + 증기 필요.' },
    kettle:     { name: '구리 티 케틀',      cat: 'kitchen', w: 1, h: 1, cost: 600,  appeal: 2, lv: 1, needs: ['hot'], cook: true,
                  desc: '증기로 물을 끓인다.' },
    oven:       { name: '증기 오븐',         cat: 'kitchen', w: 1, h: 1, cost: 1500, appeal: 2, lv: 2, needs: ['hot'], cook: true,
                  desc: '고압 증기로 굽는다.' },
    sink:       { name: '도자기 싱크대',      cat: 'kitchen', w: 1, h: 1, cost: 500,  appeal: 1, lv: 1, needs: ['cold', 'hot'],
                  desc: '위생 필수! 급수+급탕 연결된 싱크대가 있어야 영업 가능.' },
    counter:    { name: '서빙 카운터',        cat: 'kitchen', w: 2, h: 1, cost: 400,  appeal: 2, lv: 1, needs: [],
                  desc: '완성된 메뉴가 놓이는 곳. 영업에 필요.' },

    table_wood: { name: '원목 원탁',     cat: 'furniture', w: 1, h: 1, cost: 150, appeal: 2, lv: 1, table: true },
    table_brass:{ name: '황동 원탁',     cat: 'furniture', w: 1, h: 1, cost: 320, appeal: 4, lv: 2, table: true },
    table_long: { name: '긴 연회 테이블', cat: 'furniture', w: 2, h: 1, cost: 400, appeal: 5, lv: 3, table: true },
    chair_wood: { name: '나무 의자',     cat: 'furniture', w: 1, h: 1, cost: 80,  appeal: 1, lv: 1, seat: true },
    chair_leather:{name:'가죽 안락의자', cat: 'furniture', w: 1, h: 1, cost: 260, appeal: 3, lv: 2, seat: true },
    sofa:       { name: '체스터필드 소파', cat: 'furniture', w: 2, h: 1, cost: 600, appeal: 6, lv: 3, seat: true },

    plant:      { name: '화분 야자',     cat: 'decor', w: 1, h: 1, cost: 120, appeal: 3, lv: 1 },
    bookshelf:  { name: '고서 책장',     cat: 'decor', w: 1, h: 1, cost: 350, appeal: 4, lv: 1 },
    gramophone: { name: '축음기',        cat: 'decor', w: 1, h: 1, cost: 500, appeal: 6, lv: 2 },
    clock:      { name: '괘종시계',      cat: 'decor', w: 1, h: 1, cost: 450, appeal: 5, lv: 2 },
    globe:      { name: '황동 지구본',    cat: 'decor', w: 1, h: 1, cost: 600, appeal: 6, lv: 3 },
    telescope:  { name: '망원경',        cat: 'decor', w: 1, h: 1, cost: 700, appeal: 7, lv: 4 },
    organ:      { name: '증기 파이프 오르간', cat: 'decor', w: 2, h: 1, cost: 2200, appeal: 16, lv: 5 },
    fountain:   { name: '톱니 분수',      cat: 'decor', w: 2, h: 2, cost: 3000, appeal: 22, lv: 6 },

    // NAPLE 저장소 도트 소품 (naple: 아틀라스 키)
    flower_p:   { name: '보라꽃 화분',    cat: 'decor', w: 1, h: 1, cost: 60,   appeal: 2, lv: 1, naple: 'v_flower_p' },
    flower_r:   { name: '붉은꽃 화분',    cat: 'decor', w: 1, h: 1, cost: 60,   appeal: 2, lv: 1, naple: 'v_flower_r' },
    flower_y:   { name: '노란꽃 화분',    cat: 'decor', w: 1, h: 1, cost: 60,   appeal: 2, lv: 1, naple: 'v_flower_y' },
    bean_barrel:{ name: '원두 나무통',    cat: 'decor', w: 1, h: 1, cost: 150,  appeal: 2, lv: 1, naple: 'v_barrel' },
    steel_barrel:{name: '강철 물통',      cat: 'decor', w: 1, h: 1, cost: 180,  appeal: 2, lv: 1, naple: 'i_barrel' },
    crate:      { name: '원두 포대 상자',  cat: 'decor', w: 1, h: 1, cost: 100,  appeal: 1, lv: 1, naple: 'v_crate' },
    chest:      { name: '찻잎 보관함',    cat: 'decor', w: 1, h: 1, cost: 250,  appeal: 3, lv: 2, naple: 'v_chest' },
    bush:       { name: '실내 관목',      cat: 'decor', w: 2, h: 1, cost: 220,  appeal: 4, lv: 2, naple: 'v_bush_c' },
    flowerbed:  { name: '꽃덤불 화단',    cat: 'decor', w: 2, h: 1, cost: 320,  appeal: 5, lv: 2, naple: 'f_flowers_r' },
    gears:      { name: '톱니바퀴 오브제', cat: 'decor', w: 2, h: 1, cost: 900,  appeal: 8, lv: 3, naple: 'i_gears' },
    brazier:    { name: '푸른 증기 화로',  cat: 'decor', w: 1, h: 1, cost: 1200, appeal: 9, lv: 4, naple: 'i_brazier', light: 2.5 },

    // 바닥에 두는 조명 (light: 비추는 반경, 칸)
    floorlamp:  { name: '스탠드 가스등',   cat: 'decor', w: 1, h: 1, cost: 220,  appeal: 3, lv: 1, light: 2.6 },
    tablelamp:  { name: '황동 테이블 램프', cat: 'decor', w: 1, h: 1, cost: 140,  appeal: 2, lv: 1, light: 1.8 },
    // 새 오브제
    tubeman:    { name: '증기 춤추는 풍선인형', cat: 'decor', w: 1, h: 1, cost: 900, appeal: 8, lv: 2, needs: ['hot'],
                  desc: '증기를 불어넣으면 흐느적흐느적 춤을 춘다. 급탕(증기)관 연결 필요.' },
    monstera:   { name: '몬스테라 화분',   cat: 'decor', w: 1, h: 1, cost: 180,  appeal: 3, lv: 1 },
    snakeplant: { name: '산세베리아',      cat: 'decor', w: 1, h: 1, cost: 130,  appeal: 2, lv: 1 },
    ficus:      { name: '고무나무',        cat: 'decor', w: 1, h: 1, cost: 320,  appeal: 4, lv: 2 },
    celadon:    { name: '청자 매병',       cat: 'decor', w: 1, h: 1, cost: 650,  appeal: 6, lv: 3 },
    moonjar:    { name: '백자 달항아리',   cat: 'decor', w: 1, h: 1, cost: 800,  appeal: 7, lv: 4 },
    onggi:      { name: '옹기 항아리',     cat: 'decor', w: 1, h: 1, cost: 160,  appeal: 2, lv: 1 },

    gaslamp:    { name: '가스 램프',      cat: 'ceilitem', layer: 'ceil', w: 1, h: 1, cost: 120, appeal: 2, lv: 1, light: 2.2 },
    chandelier: { name: '황동 샹들리에',   cat: 'ceilitem', layer: 'ceil', w: 1, h: 1, cost: 700, appeal: 6, lv: 3, light: 3.5 },
    arclamp:    { name: '증기 아크등 줄',   cat: 'ceilitem', layer: 'ceil', w: 1, h: 1, cost: 380, appeal: 4, lv: 2, light: 3.0 },
    fan:        { name: '증기 실링팬',     cat: 'ceilitem', layer: 'ceil', w: 1, h: 1, cost: 400, appeal: 3, lv: 2 },
    pipedeco:   { name: '노출 배관 장식',   cat: 'ceilitem', layer: 'ceil', w: 1, h: 1, cost: 90,  appeal: 1, lv: 1 },
  },

  ingredients: {
    beans: { name: '원두',   icon: '🫘', pack: 10, price: 30 },
    milk:  { name: '우유',   icon: '🥛', pack: 10, price: 25 },
    tea:   { name: '찻잎',   icon: '🍃', pack: 10, price: 20 },
    flour: { name: '밀가루', icon: '🌾', pack: 10, price: 15 },
    cocoa: { name: '코코아', icon: '🍫', pack: 10, price: 40 },
  },
  coal: { pack: 50, price: 50 },

  // time: 게임 분
  recipes: {
    espresso:   { name: '에스프레소',     eq: 'espresso', lv: 1, time: 15, yield: 4, price: 9,  icon: '☕', use: { beans: 1 } },
    americano:  { name: '아메리카노',     eq: 'espresso', lv: 1, time: 15, yield: 5, price: 11, icon: '☕', use: { beans: 1 } },
    latte:      { name: '카페라떼',       eq: 'espresso', lv: 2, time: 20, yield: 5, price: 15, icon: '🥛', use: { beans: 1, milk: 1 } },
    cappuccino: { name: '카푸치노',       eq: 'espresso', lv: 3, time: 25, yield: 5, price: 17, icon: '☁️', use: { beans: 1, milk: 1 } },
    mocha:      { name: '증기 모카',      eq: 'espresso', lv: 5, time: 30, yield: 5, price: 22, icon: '🍫', use: { beans: 1, milk: 1, cocoa: 1 } },
    earlgrey:   { name: '얼그레이',       eq: 'kettle',   lv: 1, time: 15, yield: 5, price: 10, icon: '🫖', use: { tea: 1 } },
    milktea:    { name: '로열 밀크티',    eq: 'kettle',   lv: 3, time: 25, yield: 5, price: 16, icon: '🧋', use: { tea: 1, milk: 1 } },
    hotchoco:   { name: '핫초콜릿',       eq: 'kettle',   lv: 4, time: 20, yield: 5, price: 18, icon: '🍫', use: { cocoa: 1, milk: 1 } },
    scone:      { name: '버터 스콘',      eq: 'oven',     lv: 2, time: 40, yield: 8, price: 9,  icon: '🥐', use: { flour: 1, milk: 1 } },
    gearcookie: { name: '톱니바퀴 쿠키',   eq: 'oven',     lv: 3, time: 45, yield: 10, price: 8, icon: '🍪', use: { flour: 1, cocoa: 1 } },
    brasscake:  { name: '황동 케이크',     eq: 'oven',     lv: 6, time: 60, yield: 6, price: 28, icon: '🍰', use: { flour: 2, milk: 1, cocoa: 1 } },
  },

  // 손님 로스터 — sheet: assets/chars/<sheet>.png (규격은 assets/README.md). 없으면 코드로 그린 임시 도트.
  // f: 여성 버전 (임시 도트에서 긴 머리), small: 아이 체형
  // 직원: 고용비 + 일급(영업 마감 때 지급). 레벨이 오르면 더 많이 둘 수 있다
  staff: {
    waiter:  { name: '서빙 직원',     icon: '🍽', hire: 600,  wage: 60, lv: 1, max: 4, chars: ['adult_f', 'adult_m'],     desc: '카운터의 메뉴를 손님 자리까지 나릅니다. 여럿이면 동시에 서빙해서 손님이 덜 기다려요' },
    barista: { name: '보조 바리스타', icon: '☕', hire: 1200, wage: 90, lv: 2, max: 2, chars: ['smith_f', 'smith_m'],     desc: '쉬고 있는 조리 설비로 재고가 적은 메뉴를 만들고, 완성품을 카운터로 옮깁니다 (재료는 창고에서 씀)' },
    cleaner: { name: '청소부',        icon: '🧹', hire: 500,  wage: 40, lv: 2, max: 2, chars: ['miner_f', 'miner_m'],     desc: '바닥의 커피 얼룩을 찾아가 닦습니다' },
    stoker:  { name: '보일러공',      icon: '🔧', hire: 900,  wage: 70, lv: 3, max: 1, chars: ['plumber_m', 'plumber_f'], desc: '압력이 높으면 밸브를 열고, 새는 배관을 고치고(🪙40), 석탄이 떨어져 가면 주문합니다' },
  },
  staffNames: ['한스', '엘리자', '오스카', '마틸다', '테오', '클라라', '휴고', '로자', '펠릭스', '이다', '빅토르', '헬가', '루돌프', '아그네스', '에밀', '프리다', '구스타프', '릴리', '아서', '베아트리스'],
  customerTypes: [
    { id: 'adult_m',    name: '시민 (남)',      weight: 18, pay: 1.0, picky: 0,  patience: 70, coat: '#6b4f3a', hat: '#2b2b2b', hair: '#4a2e1c' },
    { id: 'adult_f',    name: '시민 (여)',      weight: 18, pay: 1.0, picky: 0,  patience: 70, coat: '#7a4a5a', hat: '#5a3a4a', hair: '#7a3a1c', f: true },
    { id: 'elder_m',    name: '노신사',         weight: 7,  pay: 1.2, picky: 5,  patience: 90, coat: '#4a4a3a', hat: '#2a2a2a', hair: '#cfcfcf', tophat: true },
    { id: 'elder_f',    name: '노부인',         weight: 7,  pay: 1.2, picky: 5,  patience: 90, coat: '#5a4a6a', hat: '#3a2a4a', hair: '#dedede', f: true },
    { id: 'child_m',    name: '꼬마 (남)',      weight: 6,  pay: 0.7, picky: 0,  patience: 45, coat: '#4a6a8a', hat: '#6a4a2a', hair: '#5a3a1c', small: true },
    { id: 'child_f',    name: '꼬마 (여)',      weight: 6,  pay: 0.7, picky: 0,  patience: 45, coat: '#a85a5a', hat: '#c8952f', hair: '#a8652a', small: true, f: true },
    { id: 'miner_m',    name: '광부 (남)',      weight: 8,  pay: 1.1, picky: 0,  patience: 55, coat: '#3a3a3a', hat: '#c8952f', hair: '#2a1a10', goggles: true },
    { id: 'miner_f',    name: '광부 (여)',      weight: 6,  pay: 1.1, picky: 0,  patience: 55, coat: '#40382e', hat: '#c8952f', hair: '#3a2010', goggles: true, f: true },
    { id: 'smith_m',    name: '대장장이 (남)',   weight: 6,  pay: 1.15, picky: 0, patience: 60, coat: '#5a2e1e', hat: '#3a2a1e', hair: '#1a1a1a' },
    { id: 'smith_f',    name: '대장장이 (여)',   weight: 5,  pay: 1.15, picky: 0, patience: 60, coat: '#6a3420', hat: '#3a2a1e', hair: '#8a2a1a', f: true },
    { id: 'plumber_m',  name: '배관공 (남)',    weight: 5,  pay: 1.1, picky: 0,  patience: 60, coat: '#2a3a6a', hat: '#4a2e1c', hair: '#4a2e1c', goggles: true },
    { id: 'plumber_f',  name: '배관공 (여)',    weight: 5,  pay: 1.1, picky: 0,  patience: 60, coat: '#2e6a62', hat: '#4a2e1c', hair: '#5a3a1c', goggles: true, f: true },
    { id: 'engineer_m', name: '기관사 (남)',    weight: 6,  pay: 1.1, picky: 0,  patience: 55, coat: '#3e5560', hat: '#4a3a28', hair: '#4a2e1c', goggles: true },
    { id: 'engineer_f', name: '기관사 (여)',    weight: 5,  pay: 1.1, picky: 0,  patience: 55, coat: '#365a5a', hat: '#4a3a28', hair: '#2a1a10', goggles: true, f: true },
    { id: 'aviator_m',  name: '비행사 (남)',    weight: 4,  pay: 1.3, picky: 5,  patience: 60, coat: '#7a3b2e', hat: '#5a4030', hair: '#a8652a', goggles: true },
    { id: 'aviator_f',  name: '비행사 (여)',    weight: 4,  pay: 1.3, picky: 5,  patience: 60, coat: '#8a4a2e', hat: '#5a4030', hair: '#e0b050', goggles: true, f: true },
    { id: 'noble_m',    name: '귀족 (남)',      weight: 3,  pay: 2.5, picky: 15, patience: 80, coat: '#4b2a5a', hat: '#111', hair: '#3a2a1a', tophat: true, vip: true },
    { id: 'noble_f',    name: '귀족 (여)',      weight: 3,  pay: 2.5, picky: 15, patience: 80, coat: '#2a3a6a', hat: '#2a1a3a', hair: '#e8d090', tophat: true, vip: true, f: true },
  ],

  // 주인공 (바리스타) — 시트가 없으면 NAPLE 마법사 스프라이트로 대체
  heroes: [
    { id: 'hero_m', name: '주인공 (남)' },
    { id: 'hero_f', name: '주인공 (여)' },
  ],

  // 열 모델 (W). 실내 1칸 ≈ 1㎡ 로 본다.
  thermal: {
    target: 22,        // 보일러 온도조절 목표 °C
    uaPerTile: 4,      // 외피 열손실계수 W/K (칸당)
    heatPerTile: 150,  // 난방이 닿는 칸 1칸의 최대 공급 W
    // 내부 발열: sens = 현열(공기 온도를 올림), lat = 잠열(수증기 → 습도)
    person: { sens: 70, lat: 45 },     // 앉아 있는 손님
    barista: { sens: 75, lat: 70 },    // 서서 일하는 바리스타
    plant: { sens: -8, lat: 8 },       // 증산작용: 현열을 잠열로 바꾼다
    cooking: { espresso: [80, 220], kettle: [100, 260], oven: [320, 40] }, // 조리 중 [현열, 잠열]
    steamLeak: { sens: 150, lat: 450 },
  },
  plantObjects: ['plant', 'bush', 'flowerbed', 'flower_p', 'flower_r', 'flower_y', 'monstera', 'snakeplant', 'ficus'],
  // 밤에 조명이 안 닿는 자리에 앉은 손님 만족도 감점
  darkSeatPenalty: 8,

  // 고양이: 몸무게에 비례한 실제 수준의 발열 (4kg ≈ 20W)
  cats: [
    { id: 'cheese',   name: '치즈냥',     fur: ['#e8973a', '#b8641e', '#fff0d0'], sens: 16, lat: 5,  cost: 600,  lv: 1, kg: 4.5 },
    { id: 'mackerel', name: '고등어냥',   fur: ['#8a8f94', '#4a4f55', '#e8e8e0'], sens: 14, lat: 5,  cost: 600,  lv: 1, kg: 4 },
    { id: 'tuxedo',   name: '턱시도냥',   fur: ['#2a2a2e', '#141416', '#f4f4f0'], sens: 15, lat: 5,  cost: 700,  lv: 2, kg: 4.2 },
    { id: 'coon',     name: '증기 메인쿤', fur: ['#8a5a32', '#4a2e18', '#e8d0a8'], sens: 28, lat: 9,  cost: 1500, lv: 3, kg: 8, big: true },
  ],
  // 증기 은행 대출: 원금 × (1 + 이자) 를 days 일에 나눠 영업 마감 때 자동 상환
  loans: [
    { id: 'small', name: '소액 운영자금',   amount: 3000,  rate: 0.08, days: 7,  lv: 1 },
    { id: 'mid',   name: '설비 개선 대출',  amount: 8000,  rate: 0.12, days: 12, lv: 2 },
    { id: 'big',   name: '증기왕 사업자금', amount: 20000, rate: 0.18, days: 20, lv: 4 },
  ],
  loanLateFee: 0.1,   // 상환 못한 날 그날 상환금의 10% 가 잔액에 붙고 평판 -3
  // 대출 한도(남은 원리금 합계 기준) = 4000 + 레벨×3000 + 평판×60

  // 커피 얼룩: 손님이 다 마시고 일어날 때 쏟는 확률, 얼룩 하나당 분위기 감점, 근처 손님 만족도 감점
  stain: { chance: 0.22, max: 30, appeal: 2, nearSat: 5 },
  catMax: 3,
  catFoodPerDay: 15,
  catAppeal: 5,

  // 공간 확장: 한 번에 2칸씩. n번째(0부터) 확장은 Lv.(2+n) 필요, 공사비 = expandBase × (1 + 0.75n)
  expandStep: 2,

  // 난이도: repLoss = 평판 감소 배율(쉬움은 안 떨어짐), patience = 손님 인내심 배율, coalMul = 석탄값 배율
  difficulty: {
    easy:   { name: '쉬움',   repLoss: 0,   patience: 1.3, coalMul: 1,    desc: '평판이 떨어지지 않고 손님이 오래 기다려 줍니다' },
    normal: { name: '보통',   repLoss: 1,   patience: 1,   coalMul: 1,    desc: '기본 규칙' },
    hard:   { name: '어려움', repLoss: 1.5, patience: 0.8, coalMul: 1.25, desc: '평판이 더 쉽게 떨어지고 손님이 급하며 석탄이 비쌉니다' },
  },
  // 손님이 나가며 하는 말 (항상 좋은 말)
  happyLines: ['맛있어요!', '또 올게요~', '분위기 좋네요', '따뜻해서 좋아요', '커피 향 최고!', '단골 할래요', '잘 먹었습니다', '여기 마음에 들어요'],
  byeLines: ['다음에 또 올게요', '바빠 보이네요, 또 올게요', '나중에 다시 올게요'],

  levels: [0, 60, 160, 320, 560, 900, 1350, 1950, 2700, 3600, 5000],
};
