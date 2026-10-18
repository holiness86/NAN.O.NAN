const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const staticDir = path.resolve(process.argv[2] || 'public');
const source = path.join(staticDir, 'images', 'logo', 'Nan.O.Nan-brand.png');
const outDir = path.join(staticDir, 'images', 'icons');
const background = '#F6ECE5';

async function plain(size, name) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, name));
}

async function padded(size, name, ratio) {
  const inner = Math.round(size * ratio);
  const logo = await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, name));
}

(async () => {
  if (!fs.existsSync(source)) {
    console.error('Logo not found: ' + source);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  await Promise.all([
    plain(192, 'icon-192.png'),
    plain(512, 'icon-512.png'),
    padded(512, 'maskable-512.png', 0.7),
    padded(180, 'apple-touch-icon.png', 0.84)
  ]);
  console.log('Icons written to ' + outDir);
})();