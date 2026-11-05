# Сверка с API Ozon

- **Дата сверки:** 2026-11-05
- **Источник:** официальная документация [Ozon Seller API](https://docs.ozon.ru/api/seller/). Сайт не открывается автоматическими инструментами и подгружает спецификацию скриптом, поэтому описания методов и примеры ответов пользователь скопировал из браузера вручную. Сохранённая страница (`docs/domain/sources/ozon/`) — пустая оболочка без спецификации. Всё, что взято из документации (методы, поля, типы, значения статусов, примеры форматов), перенесено в этот документ — он и есть долговременная копия. Тексты обзорных разделов «Схема FBO» и «Схема FBS Стандарт» использованы для выбора методов.
- **Решение:** [ADR-0010](../adr/0010-контракт-api-и-адаптеры.md). Глоссарий и формулы — [domain.md](../domain.md).

## Какие методы изображает генератор

| Данные | Метод | Статус на 2026-11-05 |
|---|---|---|
| Отправления FBO | `POST /v3/posting/fbo/list` | актуальный; `/v2/posting/fbo/list` отключён 31.08.2026 |
| Отправления FBS | `POST /v4/posting/fbs/list` | актуальный; `/v3/posting/fbs/list` отключён 31.08.2026 |
| Возвраты FBO и FBS | `POST /v1/returns/list` | актуальный |
| Начисления: дата продажи, комиссия, логистика | `POST /v1/finance/accrual/by-day` | актуальный; заменяет `/v3/finance/transaction/list` (отключается 08.09.2026) |
| Остатки на складах Ozon (FBO) | `POST /v1/analytics/stocks` | актуальный |
| Остатки на складе продавца (FBS) | `POST /v1/product/info/warehouse/stocks` | актуальный |

Все методы — `POST` на `api-seller.ozon.ru` с заголовками `Client-Id` и `Api-Key`.

## Поля, которые использует генератор

### Отправления — `postings[]` (FBO и FBS)

Общая обёртка ответа: `cursor`, `has_next`, `postings`. Время — UTC (`Z`), у FBO с микросекундами (`2026-05-10T23:59:51.653736Z`).

| Поле | Тип | Смысл |
|---|---|---|
| `posting_number` | string | номер отправления (`9121072335-0187-1`) |
| `order_id`, `order_number` | int64, string | заказ, к которому относится отправление |
| `status` | string | `awaiting_packaging` — ожидает упаковки, `awaiting_deliver` — ожидает отгрузки, `delivering` — доставляется, `delivered` — доставлено, `cancelled` — отменено |
| `substatus` | string | детализация статуса (`posting_received` — получено в пункте выдачи, `posting_canceled` и др.) |
| `created_at` (FBO), `in_process_at` | date-time UTC | создание и начало обработки отправления |
| `products[]` | array | `sku` (int64), `offer_id` (артикул продавца), `name`, `quantity`, `price: { amount: "28990", currency: "RUB" }` |
| `analytics_data.warehouse_id`, `analytics_data.warehouse_name` (FBO) / `analytics_data.warehouse` (FBS) | — | склад отгрузки; у FBO названия вида `ОМСК_РФЦ` |
| `financial_data.products[]` | array | `product_id` (= `sku`), `price`, `old_price`, `payout`, `commission: { amount, percent, currency }` |
| `cancellation` | object \| null | `cancel_reason_id`, `cancel_reason`, `cancellation_initiator`, `cancelled_after_ship` (boolean — отменено после отгрузки) |
| `delivery_schema` (FBS) | string | `fbs` |

### Возвраты — `returns[]`

Обёртка: `returns`, `has_next`; пагинация по `last_id`, до 500 за запрос.

| Поле | Тип | Смысл |
|---|---|---|
| `id` | string | ID возврата |
| `posting_number`, `order_id`, `order_number` | string | исходное отправление |
| `schema` | string | `Fbo` / `Fbs` |
| `type` | string | `FullReturn` и др. |
| `return_reason_name` | string | причина («Покупатель отказался при вручении: …») |
| `product` | object | `sku`, `offer_id`, `name`, `quantity`, `price: { currency_code, price: "3318" }`, `commission_percent`, `commission` |
| `logistic.return_date` | date-time UTC | дата возврата |
| `visual.status.sys_name` | string | статус возврата (`ArrivedAtReturnPlace` и др.) |

### Начисления за день — `accruals[]`

Запрос по одной дате (`date: YYYY-MM-DD`), пагинация по `last_id`. Суммы — строки в объектах `{ amount, currency }`.

| Поле | Смысл |
|---|---|
| `date` | дата начисления |
| `accrual_id`, `unit_number` | ID начисления и номер учётной единицы |
| `posting.delivery_schema` | схема (`fbo` / `fbs`) |
| `posting.products[].sku` | товар |
| `posting.products[].commission.sale_price` | цена продажи |
| `posting.products[].commission.sale_commission` | комиссия Ozon с продажи |
| `posting.products[].delivery.total_accrued` | итог за доставку (логистика) |
| `total_amount` | итог начисления |

### Остатки FBO — `items[]` (`/v1/analytics/stocks`)

| Поле | Смысл |
|---|---|
| `sku`, `offer_id`, `name` | товар |
| `warehouse_id`, `warehouse_name` | склад Ozon |
| `available_stock_count` | доступно к продаже |
| `ads` | среднесуточные продажи за 28 дней (своя метрика Ozon, нами не используется) |
| `idc` | дней хватит остатка по расчёту Ozon (не используется) |

### Остатки FBS — `stocks[]` (`/v1/product/info/warehouse/stocks`)

| Поле | Смысл |
|---|---|
| `sku`, `offer_id`, `product_id` | товар |
| `warehouse_id` | склад продавца |
| `present`, `reserved`, `free_stock` | всего, в резерве, свободно |
| `updated_at` | время обновления |

## Соответствие доменной модели

Правила учёта и формулы — [domain.md](../domain.md) («Два правила учёта»). Каждая строка ниже проверяется тестом адаптера (AC-10).

| Доменное поле | Откуда у Ozon | Правило |
|---|---|---|
| площадка | — | всегда `ozon` |
| схема FBO/FBS | метод, из которого пришло отправление | `/v3/posting/fbo/list` → `FBO`, `/v4/posting/fbs/list` → `FBS` |
| ID заказа | `posting_number` | генератор кладёт в отправление один товар с `quantity = 1` — как «1 заказ = 1 единица» у WB |
| артикул площадки | `products[].sku` | число → строка (`9880276314` → `"9880276314"`) |
| артикул продавца, название | `products[].offer_id`, `products[].name` | как есть |
| категория, себестоимость | справочник продавца в нашем BFF, по `sku` | в отправлениях их нет |
| склад FBO | `analytics_data.warehouse_name` | по таблице складов ниже |
| склад FBS | `analytics_data.warehouse` | как есть: название, которое продавец дал своему складу («Склад продавца, Москва») |
| дата и время заказа | FBO: `created_at`; FBS: `in_process_at` | UTC → Москва (UTC+3): `2026-05-10T22:30:00Z` → 11 мая 01:30 |
| цена заказа, выкупа и возврата | `products[].price.amount` | строка → число (`"28990"` → `28990`) |
| итог «в пути» | `status` = `awaiting_packaging`, `awaiting_deliver` или `delivering` | |
| выкуп и его дата | `status = delivered`; дата — `date` начисления (`/v1/finance/accrual/by-day`) с `commission.sale_price` по этому отправлению | в списке отправлений даты доставки нет |
| итог «отменён» и дата отмены | `status = cancelled`; дата — `changed_at` из журнала статусов BFF (см. ниже) | `cancellation.cancelled_after_ship = true` — товар ехал к покупателю (доставка и обратная доставка), `false` — отмена до отправки, логистики нет. Отказ при получении — тоже `cancelled` (domain.md) |
| итог «возвращён» и дата возврата | запись `/v1/returns/list` с этим `posting_number`, при `status = delivered` у отправления; дата — `logistic.return_date` | UTC → Москва. Запись возврата у отправления не в статусе `delivered` игнорируется: это отказ при получении, он уже учтён как отмена |
| комиссия выкупа | `financial_data.products[].commission.amount` | число |
| комиссия возврата (возвращается продавцу) | `product.commission.price` записи возврата | строка → число |
| логистика | `posting.products[].delivery.total_accrued.amount` начислений, по модулю; дата — `date` начисления | Ozon списывает со знаком «−»: `"-85.00"` → `85` |
| остаток FBO | `available_stock_count` (`/v1/analytics/stocks`), склад — `warehouse_name` по таблице складов | |
| остаток FBS | `free_stock` (`/v1/product/info/warehouse/stocks`), склад — по `warehouse_id` из справочника складов продавца | |

**Даты.** Все моменты времени Ozon — UTC (`Z`), день по Москве получается сдвигом на +3 часа. `date` начисления — `ГГГГ-ММ-ДД`, берётся как есть (допущение: Ozon считает дни начислений по Москве).

### Склады

| `warehouse_name` в API (FBO) | Наше название | Схема |
|---|---|---|
| `ХОРУГВИНО_РФЦ` | Хоругвино | FBO |
| `ПУШКИНО_1_РФЦ` | Пушкино | FBO |
| `ГРИВНО_РФЦ` | Гривно | FBO |
| `КАЗАНЬ_РФЦ` | Казань | FBO |
| `НОВОСИБИРСК_РФЦ` | Новосибирск | FBO |
| — (`analytics_data.warehouse`, склад продавца) | Склад продавца, Москва | FBS |

Формат «ГОРОД_РФЦ» — как в примерах документации (`ОМСК_РФЦ`, `РОСТОВ-НА-ДОНУ_РФЦ`). Незнакомое `warehouse_name` адаптер не угадывает, а бросает ошибку.

### Журнал статусов BFF (не API Ozon)

Даты отмены в API нет. Реальный BFF записывал бы время, когда увидел смену статуса (пуш-уведомления Ozon или фильтр `last_changed_status_date`). Генератор отдаёт это как отдельную структуру BFF рядом с ответами API:

| Поле | Тип | Смысл |
|---|---|---|
| `posting_number` | string | отправление |
| `status` | string | новый статус (`cancelled`) |
| `changed_at` | date-time UTC | когда статус сменился |

## Расхождения и допущения

- **Дата отмены** — из журнала статусов BFF (см. выше), а не из API.
- **Связь начисления с отправлением.** В примере `/v1/finance/accrual/by-day` нет поля `posting_number`; допущение — начисление связывается с отправлением через `unit_number` (генератор кладёт туда `posting_number`). Пример ответа в документации заполнен заглушками (`"string"`, `0`), описаний полей нет.
- **Почему не `/v1/finance/accrual/postings`.** Он отдаёт начисления по `posting_number` (`accrual_date`, `accrued`, `sku`, `type_id`), но виды начислений различаются только числом `type_id`, а справочник `/v1/finance/accrual/types` в документации без реальных значений (`"id": 0, "name": "string"`). Отличить комиссию от логистики по нему нельзя, поэтому используется `by-day` с отдельными полями `commission` и `delivery`.
- **Отказ при получении.** В реальном `/v1/returns/list` есть и отказы при вручении («Покупатель отказался при вручении…»). У нас это отмена (domain.md), поэтому генератор делает такие отправления `cancelled` с `cancelled_after_ship = true`, а в возвраты кладёт только возвраты после выкупа.
- **Набор значений.** Генератор создаёт только 5 статусов из таблицы выше; у FBS в реальности их больше (`awaiting_registration`, `arbitration`, `not_accepted` и др.). Сырая zod-схема принимает любую строку статуса; адаптер на незнакомом статусе бросает ошибку.
- **Типы полей.** `order_id` в отправлениях — число, в возвратах — строка (`"24540784250"`), как в примерах документации.
- **Один товар в отправлении.** Настоящее отправление может содержать несколько товаров (`products[]`); генератор кладёт один — так метрики «на единицу» совпадают у обеих площадок. Адаптер всё равно обходит массив целиком.
- **Метрики Ozon `ads` и `idc`** в остатках не используются: скорость продаж и дни запаса считаются у нас одинаково для обеих площадок, за 14 дней ([domain.md](../domain.md)), а не за 28, как у Ozon.
- **Валюта** — только `RUB`; юрлица (`legal_info`), экспресс-доставка и rFBS не генерируются.
