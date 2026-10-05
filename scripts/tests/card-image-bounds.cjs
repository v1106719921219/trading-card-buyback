const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
const mod = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/card-image-bounds.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod })
for (const alpha of [0, 255]) {
  const pixels = new Uint8ClampedArray(400 * 400 * 4).fill(255)
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = alpha
  for (let y = 40; y < 360; y++) for (let x = 86; x < 314; x++) {
    const i = (y * 400 + x) * 4
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 50
    pixels[i + 3] = 255
  }
  const bounds = mod.cardImageBounds(400, 400, pixels)
  assert.equal(bounds.left, 84)
  assert.equal(bounds.top, 38)
  assert.equal(bounds.width, 232)
  assert.equal(bounds.height, 324)
}
const blank = mod.cardImageBounds(10, 10, new Uint8ClampedArray(400).fill(255))
assert.equal(blank.width, 10)
assert.equal(blank.height, 10)
const landscape = new Uint8ClampedArray(400).fill(0)
for (let i = 3; i < landscape.length; i += 4) landscape[i] = 255
assert.equal(mod.cardImageBounds(20, 5, landscape).width, 20)
console.log('PASS: transparent/white margins, edge padding, empty and non-card fallback')
