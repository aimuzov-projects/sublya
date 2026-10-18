import { siteChecks } from '@aimuzov-projects/infra-site-kit/playwright/checks'

// Общие проверки сайтов: страницы из sitemap, axe, отложенная Яндекс Метрика и 404.
// Подсказок на 404 нет: в sitemap одна главная.
// Кнопки темы на сайте нет.
siteChecks({ metrika: true, notFound: { suggest: false } })
