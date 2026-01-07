import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

const sizes = [16, 32, 48, 128];

async function generateIcons() {
  for (const size of sizes) {
    const outPath = path.join(iconsDir, `icon${size}.png`);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`Generated ${outPath}`);
  }
  console.log('Done!');
}

generateIcons().catch(console.error);
