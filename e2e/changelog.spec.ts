import { expect, test } from '@playwright/test'

test('значок в шапке ведёт на «Что нового» и там горит без ссылки', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('banner').getByRole('link', { name: 'Что нового' }).click()

	await expect(page).toHaveURL(/\/changelog\/?$/)
	await expect(page.getByRole('heading', { level: 1, name: 'Что нового' })).toBeVisible()

	const own = page.getByRole('banner').getByLabel('Что нового')

	await expect(own).toHaveAttribute('aria-current', 'page')
	await expect(own).not.toHaveAttribute('href')
})

test('ссылка в подвале ведёт на «Что нового»', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('contentinfo').getByRole('link', { name: 'Что нового' }).click()

	await expect(page).toHaveURL(/\/changelog\/?$/)
})

test('оглавление ведёт к первому релизу', async ({ page }) => {
	await page.goto('/changelog/')

	await expect(page.locator('#v0-1-0')).toContainText('версия 0.1.0')
	await page.getByRole('navigation', { name: 'Релизы' }).getByRole('link').last().click()
	await expect(page).toHaveURL(/#v0-1-0$/)
})
