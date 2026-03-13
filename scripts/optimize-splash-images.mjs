import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const inputDir = path.join(root, 'public', 'images', 'landing-page')
const outputDir = path.join(inputDir, 'optimized')

const files = [
  'introduction-pic.jpg',
  'introduction-pic1.jpg',
  'introduction-pic2.jpg',
  'introduction-pic3.jpg',
]

const widths = [960, 1440]

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

function baseName(fileName) {
  return fileName.replace(/\.jpg$/i, '')
}

async function optimizeFile(fileName) {
  const inputPath = path.join(inputDir, fileName)
  const stem = baseName(fileName)

  for (const width of widths) {
    const resized = sharp(inputPath).resize({
      width,
      fit: 'inside',
      withoutEnlargement: true,
    })

    await resized
      .clone()
      .webp({ quality: 82, effort: 6 })
      .toFile(path.join(outputDir, `${stem}-${width}.webp`))

    await resized
      .clone()
      .avif({ quality: 52, effort: 7 })
      .toFile(path.join(outputDir, `${stem}-${width}.avif`))
  }
}

async function main() {
  await ensureDir(outputDir)

  for (const fileName of files) {
    await optimizeFile(fileName)
  }

  console.log('Optimized splash images generated in:', outputDir)
}

main().catch((error) => {
  console.error('Failed to optimize splash images:', error)
  process.exitCode = 1
})
