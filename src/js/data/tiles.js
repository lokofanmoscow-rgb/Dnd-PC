/* Типы клеток карты */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  /* walk — можно пройти; sight — не блокирует обзор; difficult — труднопроходимая местность;
     hazard — урон при входе/в начале хода; swim — плавание (труднопроходимо без скорости плавания);
     wet — вода: по ней плавают водные существа, остальные в ней не могут совершать действия */
  const TILES = {
    floor: { name: 'Каменный пол', cat: 'Пол', walk: true, sight: true, color: '#77716a' },
    flagstone: { name: 'Плиты', cat: 'Пол', walk: true, sight: true, color: '#8a8378' },
    wood: { name: 'Деревянный пол', cat: 'Пол', walk: true, sight: true, color: '#7d5635' },
    carpet: { name: 'Ковёр', cat: 'Пол', walk: true, sight: true, color: '#7d2633' },
    grass: { name: 'Трава', cat: 'Природа', walk: true, sight: true, color: '#557d3b' },
    dirt: { name: 'Земля', cat: 'Природа', walk: true, sight: true, color: '#7b6143' },
    sand: { name: 'Песок', cat: 'Природа', walk: true, sight: true, color: '#c8b07a' },
    snow: { name: 'Снег', cat: 'Природа', walk: true, sight: true, color: '#dde6ea' },
    bush: { name: 'Кусты', cat: 'Природа', walk: true, sight: true, difficult: true, color: '#3e6b2d' },
    marsh: { name: 'Болото', cat: 'Природа', walk: true, sight: true, difficult: true, color: '#4d5933' },
    rubble: { name: 'Обломки', cat: 'Природа', walk: true, sight: true, difficult: true, color: '#6e6760' },
    ice: { name: 'Лёд', cat: 'Природа', walk: true, sight: true, difficult: true, color: '#b9dbe8' },
    web: { name: 'Паутина', cat: 'Природа', walk: true, sight: true, difficult: true, color: '#55534f' },
    water: { name: 'Мелководье', cat: 'Вода', walk: true, sight: true, difficult: true, wet: true, color: '#3f7fae' },
    deep: { name: 'Глубокая вода', cat: 'Вода', walk: true, sight: true, difficult: true, swim: true, wet: true, color: '#22507e' },
    bridge: { name: 'Мост', cat: 'Вода', walk: true, sight: true, color: '#8b6a41' },
    lava: { name: 'Лава', cat: 'Опасности', walk: true, sight: true, hazard: { dice: '4d10', type: 'fire' }, color: '#d2521b' },
    fire: { name: 'Костёр / огонь', cat: 'Опасности', walk: true, sight: true, hazard: { dice: '1d10', type: 'fire' }, color: '#7b4a2a' },
    pit: { name: 'Пропасть', cat: 'Опасности', walk: false, sight: true, color: '#0d0b0a' },
    wall: { name: 'Стена', cat: 'Препятствия', walk: false, sight: false, color: '#36312d' },
    cave: { name: 'Скала', cat: 'Препятствия', walk: false, sight: false, color: '#4a3f36' },
    tree: { name: 'Дерево', cat: 'Препятствия', walk: false, sight: false, color: '#2d5521' },
    rock: { name: 'Валун', cat: 'Препятствия', walk: false, sight: true, color: '#7b7670' },
    pillar: { name: 'Колонна', cat: 'Препятствия', walk: false, sight: false, color: '#9a948a' },
    statue: { name: 'Статуя', cat: 'Препятствия', walk: false, sight: false, color: '#8f8a84' },
    door: { name: 'Дверь (открыта)', cat: 'Двери', walk: true, sight: true, door: 'open', color: '#6b4a2b' },
    doorc: { name: 'Дверь (закрыта)', cat: 'Двери', walk: false, sight: false, door: 'closed', color: '#5a3a1e' },
    table: { name: 'Стол', cat: 'Мебель', walk: true, sight: true, difficult: true, color: '#6a4426' },
    crate: { name: 'Ящик', cat: 'Мебель', walk: false, sight: true, color: '#9a7443' },
    barrel: { name: 'Бочка', cat: 'Мебель', walk: false, sight: true, color: '#7d5a33' },
    chest: { name: 'Сундук', cat: 'Мебель', walk: false, sight: true, color: '#8b6325' },
    altar: { name: 'Алтарь', cat: 'Мебель', walk: false, sight: true, color: '#c2bbb0' },
    stairs: { name: 'Лестница', cat: 'Мебель', walk: true, sight: true, color: '#6d665e' },
  };
  for (const k in TILES) TILES[k].id = k;

  D.TILES = TILES;
  D.tile = (id) => TILES[id] || TILES.floor;
  D.TILE_CATS = ['Пол', 'Природа', 'Вода', 'Опасности', 'Препятствия', 'Двери', 'Мебель'];
})(typeof window !== 'undefined' ? window : globalThis);
