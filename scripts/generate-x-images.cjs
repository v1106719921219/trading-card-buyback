const puppeteer = require('puppeteer')
const path = require('path')

const scriptsDir = __dirname
const publicDir = path.join(__dirname, '..', 'public')

async function main() {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  // X Icon (400x400 @3x = 1200x1200)
  await page.setViewport({ width: 400, height: 400, deviceScaleFactor: 3 })
  await page.goto(`file://${path.join(scriptsDir, 'x-icon.html')}`, { waitUntil: 'networkidle0' })
  await page.screenshot({ path: path.join(publicDir, 'x-icon.png'), type: 'png' })
  console.log('x-icon.png created (1200x1200 @3x)')

  // X Header (1500x500 @2x = 3000x1000)
  await page.setViewport({ width: 1500, height: 500, deviceScaleFactor: 2 })
  await page.goto(`file://${path.join(scriptsDir, 'x-header.html')}`, { waitUntil: 'networkidle0' })
  // フォント読み込み待ち
  await page.evaluate(() => document.fonts.ready)
  await new Promise(r => setTimeout(r, 1000))
  await page.screenshot({ path: path.join(publicDir, 'x-header.png'), type: 'png' })
  console.log('x-header.png created (3000x1000 @2x)')

  await browser.close()
  console.log('Done!')
}

main().catch(console.error)
