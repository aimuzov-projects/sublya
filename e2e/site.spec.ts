import { siteChecks } from '@aimuzov-projects/infra-site-kit/playwright/checks'

// Общие проверки сайтов: страницы из sitemap, axe и отложенная Яндекс Метрика.
// Кнопки темы на сайте нет.
siteChecks({ metrika: true })
