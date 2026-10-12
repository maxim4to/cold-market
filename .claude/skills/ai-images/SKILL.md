---
name: ai-images
description: Сгенерировать или улучшить картинку для сайта ХолодМаркет — иллюстрации услуг, плитки категорий, баннеры; апскейл старых маленьких картинок (Real-ESRGAN); «живое фото» с эффектом параллакса. Use when the user asks to generate, replace, upscale or animate a site image.
---

# Генерация и улучшение картинок

## Что можно, а что нельзя

- Можно: иллюстрации услуг, обложки категорий, баннеры, фоновые сцены.
- Нельзя: фото конкретных товаров (только реальные), логотипы и чужие бренды, люди с узнаваемыми лицами, текст на картинке.
- Перед заменой видимой картинки — показать результат пользователю. Он не раз отклонял «нереалистичные» варианты.

## Генерация (Figma MCP)

Инструмент `mcp__Figma__generate_image` (загружается через ToolSearch). План — тот, что вернёт `mcp__Figma__whoami`. **Каждый вызов тратит платные AI-кредиты** аккаунта Figma.

| Модель | Когда |
|---|---|
| `gemini-3.1-flash-lite-image` | черновик, простая сцена (дешевле всего) |
| `gemini-3.1-flash-image` | сцены с людьми |
| `gpt-image-2.5-sunburst` | когда важна правдоподобная геометрия оборудования (самая сильная) |

Промпт (по-английски) — проверенный шаблон:
- стиль: `realistic professional photograph for a corporate website`, `bright clean lighting, cool palette of white, light ice blue and navy`;
- для плиток каталога: `studio product photograph on a pure seamless white background`, `generous white space` — чтобы стояла в ряд с остальными плитками;
- **явно опиши физически правильную конструкцию**: «ONE glass door hinged only on the right side, the door is CLOSED», «enclosed housing, no exposed tangled pipes». Без этого модели рисуют двери, открывающиеся в обе стороны, и трубки в никуда;
- в конце: `No text, no logos, no brand names, no watermarks`, лица — `partly turned away`.

После генерации: скачать полноразмерный файл по `image.url` (ссылка живёт 7 дней) → посмотреть в полном размере (Read) → проверить геометрию, руки, мусорный текст → если плохо, перегенерировать с уточнением.

## Куда класть

1. Исходник (полное разрешение) — `assets/generated/<имя>.png`.
2. Веб-версия — `public/img/gen/<имя>.webp`: `sharp(src).resize({ width: 1200 }).webp({ quality: 80 })`.
3. Подключить: карточки услуг — `image` в `services` (`src/lib/site.ts`); страницы услуг — в `src/pages/services/*.astro`; плитка категории — `public/img/c/<имя>.webp` + рамка в `data/image-boxes.json` (или через `assets/categories` и `npm run images`).

## Апскейл старых картинок (бесплатно, локально)

Real-ESRGAN x4 через Python: отдельный venv вне репозитория, `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu`, `pip install spandrel pillow numpy`, модель `RealESRGAN_x4plus.pth` из релизов `xinntao/Real-ESRGAN`. Загрузить модель через `spandrel.ModelLoader`, прогнать тензор, сохранить PNG. Хорошо работает на рендерах и чистых фото (агрегат ТО, 3D-визуализации проектов); на шумных фото с телефона даёт «живописные» артефакты (фото «Монтажа» — откатили).

## «Живое фото» (параллакс)

Пример — карточка «Проектирование» (`public/img/gen/service-project-anim.webp`): апскейл → карта глубины (`depth-anything/Depth-Anything-V2-Small-hf` через `transformers`) → кадры со сдвигом пикселей пропорционально глубине по эллиптической траектории (замкнутый цикл, лёгкий зум против пустых краёв) → **анимированный WebP** (`ffmpeg -c:v libwebp_anim`, ~560 px, 12 fps). Не `<video>`: на iPhone в энергосбережении видео показывает кнопку Play. Встраивание — `src/components/ServiceMedia.astro` (статичный кадр для `prefers-reduced-motion`).
