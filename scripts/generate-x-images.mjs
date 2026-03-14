import puppeteer from 'puppeteer'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

async function main() {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  // --- X Icon (400x400) ---
  await page.setViewport({ width: 400, height: 400 })
  const iconSvgPath = `file://${path.join(publicDir, 'x-icon.svg')}`
  await page.goto(iconSvgPath, { waitUntil: 'networkidle0' })
  await page.screenshot({ path: path.join(publicDir, 'x-icon.png'), type: 'png' })
  console.log('x-icon.png created')

  // --- X Header (1500x500) ---
  await page.setViewport({ width: 1500, height: 500 })
  const headerSvgPath = `file://${path.join(publicDir, 'x-header.svg')}`
  await page.goto(headerSvgPath, { waitUntil: 'networkidle0' })
  await page.screenshot({ path: path.join(publicDir, 'x-header.png'), type: 'png' })
  console.log('x-header.png created')

  await browser.close()
  console.log('Done! Files saved to /public/')
}

main().catch(console.error)
