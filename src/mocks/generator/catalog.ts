import type { CatalogItem, CategoryId, Marketplace, Scheme } from '../domain'
import { createRandom, deriveSeed, type Random } from '../lib/random'
import { OZON_FBO_NAMES, OZON_SELLER_WAREHOUSE } from '../ozon'
import { WB_WAREHOUSES } from '../wb'

// Каталог магазина: ~400 товаров. Зависит только от seed, не от «сегодня»,
// поэтому прошлые дни истории не меняются при сдвиге окна (AC-2).

export type ProductWarehouse = { name: string; scheme: Scheme | null; weight: number }

export type Product = CatalogItem & {
  /** Обычная цена продажи, ₽ */
  basePrice: number
  /** Относительная популярность: чем больше, тем чаще заказывают */
  popularity: number
  warehouses: ProductWarehouse[]
}

type CategoryProfile = {
  count: number
  /** Доля товаров категории на WB; остальные — на Ozon */
  wbShare: number
  prefix: string
  price: [number, number]
  nouns: readonly string[]
  traits: readonly string[]
}

// Число товаров — как в макете фильтра категорий, с запасом до ~400 (AC-3)
const PROFILES: Record<CategoryId, CategoryProfile> = {
  shoes: {
    count: 52,
    wbShare: 0.75,
    prefix: 'SH',
    price: [1490, 6990],
    nouns: ['Кроссовки мужские', 'Кроссовки женские', 'Кеды', 'Ботинки зимние', 'Слипоны', 'Сандалии', 'Мокасины', 'Лоферы', 'Сапоги женские', 'Туфли'],
    traits: ['чёрные', 'белые', 'серые', 'бежевые', 'на платформе', 'кожаные', 'замшевые', 'текстильные'],
  },
  clothing: {
    count: 120,
    wbShare: 0.8,
    prefix: 'CL',
    price: [449, 7990],
    nouns: ['Футболка', 'Худи', 'Свитшот', 'Джинсы', 'Платье', 'Рубашка', 'Брюки', 'Куртка', 'Пуховик', 'Лонгслив', 'Юбка', 'Пижама', 'Шорты', 'Жилет', 'Кардиган', 'Топ'],
    traits: ['оверсайз', 'базовая модель', 'хлопок', 'с начёсом', 'свободный крой', 'приталенная', 'утеплённая', 'льняная', 'трикотажная', 'с капюшоном'],
  },
  electronics: {
    count: 42,
    wbShare: 0.3,
    prefix: 'EL',
    price: [390, 9990],
    nouns: ['Наушники беспроводные', 'Зарядное устройство', 'Кабель USB-C', 'Умные часы', 'Колонка портативная', 'Пауэрбанк', 'Фитнес-браслет', 'Клавиатура', 'Мышь беспроводная', 'Веб-камера'],
    traits: ['с быстрой зарядкой', 'чёрный', 'белый', 'компактный', 'с подсветкой', 'водонепроницаемый'],
  },
  beauty: {
    count: 34,
    wbShare: 0.6,
    prefix: 'BT',
    price: [249, 1990],
    nouns: ['Сыворотка для лица', 'Крем для рук', 'Шампунь', 'Маска для волос', 'Тоник', 'Бальзам для губ', 'Скраб для тела', 'Патчи для глаз'],
    traits: ['увлажняющий', 'с ниацинамидом', 'с гиалуроновой кислотой', 'для чувствительной кожи', '50 мл', '200 мл'],
  },
  home: {
    count: 58,
    wbShare: 0.35,
    prefix: 'HM',
    price: [290, 3990],
    nouns: ['Термокружка', 'Набор контейнеров', 'Плед', 'Полотенце', 'Сковорода', 'Органайзер', 'Подушка', 'Чайник заварочный', 'Набор ножей', 'Кастрюля', 'Ваза'],
    traits: ['450 мл', 'нержавеющая сталь', 'стеклянный', 'хлопковый', 'антипригарная', 'большой', 'набор из 3 шт'],
  },
  sports: {
    count: 35,
    wbShare: 0.6,
    prefix: 'SP',
    price: [390, 4990],
    nouns: ['Коврик для йоги', 'Гантели', 'Эспандер', 'Скакалка', 'Бутылка для воды', 'Фитбол', 'Перчатки для зала', 'Ролик для пресса'],
    traits: ['6 мм', 'нескользящий', 'набор', 'регулируемые', '750 мл', 'с счётчиком'],
  },
  kids: {
    count: 28,
    wbShare: 0.6,
    prefix: 'KD',
    price: [290, 2990],
    nouns: ['Конструктор', 'Пазл', 'Мягкая игрушка', 'Набор для рисования', 'Комбинезон детский', 'Шапка детская', 'Рюкзак школьный'],
    traits: ['для малышей', '500 деталей', 'развивающий', 'тёплый', 'светоотражающий', 'большой'],
  },
  accessories: {
    count: 31,
    wbShare: 0.65,
    prefix: 'AC',
    price: [290, 3490],
    nouns: ['Рюкзак городской', 'Сумка шоппер', 'Ремень кожаный', 'Кошелёк', 'Чехол для смартфона', 'Очки солнцезащитные', 'Шарф', 'Зонт складной'],
    traits: ['водоотталкивающий', 'чёрный', 'коричневый', 'противоударный', 'компактный', 'унисекс'],
  },
}

// Товары из макетов дизайна: те же названия и артикулы, лидеры продаж
const DESIGN_PRODUCTS: readonly { name: string; sku: string; marketplace: Marketplace; category: CategoryId; price: number; popularity: number }[] = [
  { name: 'Кроссовки мужские беговые', sku: '184523671', marketplace: 'wb', category: 'shoes', price: 2990, popularity: 26 },
  { name: 'Наушники беспроводные TWS с шумоподавлением', sku: '1124593302', marketplace: 'ozon', category: 'electronics', price: 2190, popularity: 30 },
  { name: 'Пуховик женский удлинённый с капюшоном', sku: '201348877', marketplace: 'wb', category: 'clothing', price: 5990, popularity: 16 },
  { name: 'Пауэрбанк 20 000 мА·ч с быстрой зарядкой', sku: '987412560', marketplace: 'ozon', category: 'electronics', price: 1290, popularity: 30 },
  { name: 'Футболка оверсайз, хлопок 100 %', sku: '156902334', marketplace: 'wb', category: 'clothing', price: 749, popularity: 40 },
  { name: 'Термокружка 450 мл, нержавеющая сталь', sku: '1043278815', marketplace: 'ozon', category: 'home', price: 719, popularity: 34 },
  { name: 'Сыворотка для лица с ниацинамидом, 30 мл', sku: '173455019', marketplace: 'wb', category: 'beauty', price: 529, popularity: 36 },
  { name: 'Коврик для йоги 6 мм, нескользящий', sku: '190277346', marketplace: 'wb', category: 'sports', price: 979, popularity: 22 },
  { name: 'Набор контейнеров для еды, 5 шт', sku: '1098834127', marketplace: 'ozon', category: 'home', price: 669, popularity: 26 },
  { name: 'Рюкзак городской 25 л, водоотталкивающий', sku: '168004512', marketplace: 'wb', category: 'accessories', price: 1590, popularity: 14 },
  { name: 'Кроссовки детские на липучках', sku: '199420731', marketplace: 'wb', category: 'shoes', price: 1890, popularity: 10 },
  { name: 'Худи унисекс с начёсом', sku: '177301928', marketplace: 'wb', category: 'clothing', price: 2490, popularity: 12 },
  { name: 'Чехол для смартфона противоударный', sku: '1015529804', marketplace: 'ozon', category: 'accessories', price: 399, popularity: 14 },
  { name: 'Бутылка для воды спортивная 750 мл', sku: '1077214563', marketplace: 'ozon', category: 'sports', price: 589, popularity: 12 },
  { name: 'Носки хлопковые, 5 пар', sku: '160553872', marketplace: 'wb', category: 'clothing', price: 449, popularity: 18 },
  { name: 'Сковорода с антипригарным покрытием 26 см', sku: '1136672018', marketplace: 'ozon', category: 'home', price: 1790, popularity: 10 },
]

/** Цена «как в магазине»: заканчивается на 90 или 99. */
function shopPrice(random: Random, [min, max]: [number, number]): number {
  const raw = min + (max - min) * random.next() ** 1.6
  const hundreds = Math.max(1, Math.round(raw / 100))
  return hundreds * 100 - (random.chance(0.5) ? 10 : 1)
}

function pickWarehouses(random: Random, marketplace: Marketplace): ProductWarehouse[] {
  if (marketplace === 'wb') {
    // Первый в справочнике — Коледино, крупнейший склад WB: почти у всех товаров
    const [main, ...others] = WB_WAREHOUSES.map((w) => w.name)
    const rest = others.filter(() => random.chance(0.3))
    const names = random.chance(0.9) || rest.length === 0 ? [main, ...rest] : rest
    return names.map((name, i) => ({ name, scheme: null, weight: i === 0 ? 3 : 1 + random.next() }))
  }
  const fbo = OZON_FBO_NAMES.filter((_, i) => i === 0 || random.chance(0.35))
  const result: ProductWarehouse[] = fbo.map((name, i) => ({ name, scheme: 'FBO', weight: i === 0 ? 3 : 1 + random.next() }))
  if (random.chance(0.35)) result.push({ name: OZON_SELLER_WAREHOUSE.name, scheme: 'FBS', weight: 1 })
  return result
}

function uniqueSku(random: Random, marketplace: Marketplace, used: Set<string>): string {
  for (;;) {
    const sku = marketplace === 'wb' ? String(random.int(150_000_000, 229_999_999)) : String(random.int(1_000_000_000, 1_199_999_999))
    if (!used.has(sku)) {
      used.add(sku)
      return sku
    }
  }
}

export function generateCatalog(seed: number): Product[] {
  const random = createRandom(deriveSeed(seed, 'catalog'))
  const usedSkus = new Set(DESIGN_PRODUCTS.map((p) => p.sku))
  const usedNames = new Set(DESIGN_PRODUCTS.map((p) => p.name))
  const sequence: Partial<Record<CategoryId, number>> = {}
  const nextOfferId = (category: CategoryId) => {
    const n = (sequence[category] ?? 0) + 1
    sequence[category] = n
    return `${PROFILES[category].prefix}-${String(n).padStart(4, '0')}`
  }
  const costOf = (price: number) => Math.round(price * (0.35 + random.next() * 0.2))

  const products: Product[] = DESIGN_PRODUCTS.map((p) => ({
    sku: p.sku,
    offerId: nextOfferId(p.category),
    name: p.name,
    category: p.category,
    marketplace: p.marketplace,
    costPrice: costOf(p.price),
    basePrice: p.price,
    popularity: p.popularity,
    warehouses: pickWarehouses(random, p.marketplace),
  }))

  for (const [category, profile] of Object.entries(PROFILES) as [CategoryId, CategoryProfile][]) {
    const designCount = DESIGN_PRODUCTS.filter((p) => p.category === category).length
    for (let i = designCount; i < profile.count; i++) {
      let name = ''
      do {
        name = `${random.pick(profile.nouns)} ${random.pick(profile.traits)}`
        if (usedNames.has(name)) name = `${name}, ${random.pick(['модель', 'серия', 'арт.'])} ${random.int(2, 99)}`
      } while (usedNames.has(name))
      usedNames.add(name)

      const marketplace: Marketplace = random.chance(profile.wbShare) ? 'wb' : 'ozon'
      const basePrice = shopPrice(random, profile.price)
      products.push({
        sku: uniqueSku(random, marketplace, usedSkus),
        offerId: nextOfferId(category),
        name,
        category,
        marketplace,
        costPrice: costOf(basePrice),
        basePrice,
        // Длинный хвост: несколько ходовых, много редких — часть остатков «без продаж»
        popularity: Math.exp(random.next() * 3.2 - 1.6),
        warehouses: pickWarehouses(random, marketplace),
      })
    }
  }
  return products
}

export function toCatalog(products: readonly Product[]): CatalogItem[] {
  return products.map(({ sku, offerId, name, category, marketplace, costPrice }) => ({ sku, offerId, name, category, marketplace, costPrice }))
}
