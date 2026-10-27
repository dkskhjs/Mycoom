// 직접 그린 스프라이트로 교체하려면 assets/sprites/<키>.png 를 넣고 여기에 키를 적는다.
// 키 목록과 권장 크기는 assets/README.md 참고. 예: ['obj_boiler', 'floor_plank_0']
window.ASSET_MANIFEST = [];

// 캐릭터 시트: assets/chars/<id>.png 를 넣고 id 를 적는다 (256x96, 규격은 assets/README.md)
// 예: ['hero_m', 'hero_f', 'elder_m', 'elder_f', 'miner_m', ...]
window.CHAR_MANIFEST = [
  'hero_m', 'hero_f',
  'adult_m', 'adult_f', 'aviator_m', 'aviator_f', 'noble_m', 'noble_f',
  'plumber_m', 'plumber_f', 'miner_m', 'miner_f', 'smith_m', 'smith_f',
];
