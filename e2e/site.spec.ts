import { siteChecks } from '@aimuzov/infra-site-kit/playwright/checks'

// Общие проверки сайтов: страницы из sitemap, axe, отложенная Яндекс Метрика и 404.
// Подсказок на 404 нет: кроме главной в sitemap только «Что нового».
// Кнопки темы на сайте нет.
siteChecks({ metrika: true, notFound: { suggest: false } })
