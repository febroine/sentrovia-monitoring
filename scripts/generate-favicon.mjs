import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "public", "sentrovia-mark-v2.png");
const appIconPath = path.join(projectRoot, "src", "app", "icon.png");
const faviconPath = path.join(projectRoot, "src", "app", "favicon.ico");
const faviconSizes = [16, 32, 48];

const source = await fs.readFile(sourcePath);
const faviconImages = await Promise.all(faviconSizes.map(createIcon));

await fs.writeFile(appIconPath, await createIcon(512));
await fs.writeFile(faviconPath, createIco(faviconImages, faviconSizes));

async function createIcon(size) {
  const inset = Math.max(2, Math.round(size * 0.14));
  const markSize = size - inset * 2;
  const markAlpha = await sharp(source)
    .extractChannel("alpha")
    .trim({ background: "#000" })
    .resize(markSize, markSize, { fit: "contain", background: "#000" })
    .png()
    .toBuffer();
  const mark = await sharp({
    create: {
      width: markSize,
      height: markSize,
      channels: 3,
      background: "#20C7B7",
    },
  })
    .joinChannel(markAlpha)
    .png()
    .toBuffer();
  const background = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.19)}" fill="#071315"/></svg>`
  );

  return sharp(background)
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
}

function createIco(images, sizes) {
  const headerSize = 6;
  const directorySize = images.length * 16;
  const header = Buffer.alloc(headerSize + directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = headerSize + directorySize;
  images.forEach((image, index) => {
    const entryOffset = headerSize + index * 16;
    const size = sizes[index];
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.length;
  });

  return Buffer.concat([header, ...images]);
}
