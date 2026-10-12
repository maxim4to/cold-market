---
name: deploy-launch
description: Деплой сайта ХолодМаркет на GitHub Pages, переменные окружения (noindex, Метрика, Jivo), переезд со стейджа mi-crafts.com/cold-market на боевой домен coldmarket-tver.ru, DNS, переадресации старых адресов, запасной хостинг в России. Use when the user asks about publishing, launch, domain, DNS, hosting or why the live site is outdated.
---

# Деплой и запуск

## Как публикуется сейчас

- Пуш в `master` → `.github/workflows/deploy.yml` → `npm ci && npm run build` → GitHub Pages. Обычно 2–3 минуты.
- Стейдж: **https://mi-crafts.com/cold-market/** (проектный сайт под личным доменом пользователя, `BASE_PATH=/cold-market`).
- Переменные (Settings → Secrets and variables → Actions → **Variables**), значения по умолчанию прописаны в workflow:

| Переменная | Стейдж | Боевой сайт |
|---|---|---|
| `SITE_URL` | `https://mi-crafts.com` | `https://coldmarket-tver.ru` |
| `BASE_PATH` | `/cold-market` | `/` |
| `PUBLIC_NOINDEX` | `true` (стейдж закрыт от поиска, иначе дубль живого сайта) | `false` |
| `PUBLIC_METRIKA_ID` | пусто (не портить статистику) | `61138234` (тот же счётчик, что у старого сайта) |
| `PUBLIC_JIVO_ID` | `sJNQnSEwuL` (тот же аккаунт Jivo) | `sJNQnSEwuL` |

- Ход деплоя — GitHub MCP: `actions_list` / `get_job_logs`. Готовность — `curl` живой страницы с маркером из свежих правок.
- GitHub Pages кэширует до 10 минут.

## Переезд на coldmarket-tver.ru (чек-лист)

1. **До переезда** — 3–4 недели собрать базу в Метрике старого сайта (цели — навык `analytics-seo`), выгрузить показатели Вебмастера и Search Console.
2. Финальный перенос данных: если на старом сайте что-то менялось — перепарсить (навык `legacy-import`) и сравнить с `data/*.json`.
3. Переменные Actions — как в колонке «Боевой сайт».
4. В репозитории: Settings → Pages → Custom domain = `coldmarket-tver.ru`, включить Enforce HTTPS. Сайт должен быть **отдельным** репозиторием-сайтом или единственным с этим доменом.
5. DNS у регистратора (сейчас **Timeweb**, `ns1.timeweb.ru`): A-записи на 185.199.108.153, .109, .110, .111 и `www` CNAME → `<user>.github.io`. Нужен доступ к аккаунту Timeweb.
6. После переключения: проверить главную, 3–4 старых адреса товаров и категорий (должны открываться как раньше), `robots.txt`, `sitemap.xml`, отправить sitemap в Яндекс Вебмастер и Google Search Console.
7. 2–4 недели следить за 404 и индексом.

Все URL старого сайта (`/<категория>.html`, `/<категория>/<товар>.html`, `/product/view/...`) сохранены. Адреса корзины, избранного и `index.php?...` на новом сайте отдают 404 — это ожидаемо.

## Ограничения GitHub Pages

- Нет серверных 301 — переадресация только HTML-страницей (`<meta http-equiv="refresh">` + `noindex`, пример `src/pages/services.astro`).
- Лимит опубликованного сайта 1 ГБ (сейчас ~250 МБ, в основном фото).
- С мая 2026 замечены перебои доступа к GitHub из части российских сетей. Если подтвердится для Pages — тот же `dist/` можно выкладывать в Yandex Object Storage + CDN или на статический хостинг Timeweb отдельным шагом workflow; код сайта не меняется.
