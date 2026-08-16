#!/usr/bin/env node
/**
 * Draws the two images the Windows installer shows, from the app icon.
 *
 * NSIS wants BMP and nothing else — no PNG, no alpha — so each is composited
 * onto a solid background here rather than left for the installer to figure
 * out. Both sizes are fixed by NSIS itself; handing it anything else gets them
 * stretched.
 *
 *   sidebar  164 x 314   the panel down the left of the welcome and finish pages
 *   header   150 x  57   the strip at the top of every page in between
 *
 * They are generated rather than drawn by hand so that changing the icon
 * changes the installer, instead of leaving two files nobody remembers exist.
 *
 *   node scripts/build-installer-art.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS = join(HERE, "..", "src-tauri", "icons");

/** The app's dark surface, so the panel is the app's own colour and not a guess. */
const DARK = [0x11, 0x13, 0x10];
const WHITE = [0xff, 0xff, 0xff];

/** Decodes a PNG into `{ width, height, pixels }`, RGBA, filters undone. */
function decodePng(path) {
  const data = readFileSync(path);
  let at = 8;
  let width = 0;
  let height = 0;
  const parts = [];

  while (at < data.length) {
    const length = data.readUInt32BE(at);
    const type = data.toString("ascii", at + 4, at + 8);
    if (type === "IHDR") {
      width = data.readUInt32BE(at + 8);
      height = data.readUInt32BE(at + 12);
      const colour = data[at + 17];
      if (colour !== 6) throw new Error(`${path} is not RGBA`);
    } else if (type === "IDAT") {
      parts.push(data.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let read = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[read];
    read += 1;
    const row = raw.subarray(read, read + stride);
    read += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? out[x - 4] : 0;
      const up = above ? above[x] : 0;
      const corner = above && x >= 4 ? above[x - 4] : 0;
      let value = row[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const dl = Math.abs(p - left);
        const du = Math.abs(p - up);
        const dc = Math.abs(p - corner);
        value += dl <= du && dl <= dc ? left : du <= dc ? up : corner;
      }
      out[x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

/** Nearest neighbour is enough: the source is 512 and every target is smaller. */
function sample(image, u, v) {
  const x = Math.min(image.width - 1, Math.max(0, Math.round(u)));
  const y = Math.min(image.height - 1, Math.max(0, Math.round(v)));
  const at = (y * image.width + x) * 4;
  return [image.pixels[at], image.pixels[at + 1], image.pixels[at + 2], image.pixels[at + 3]];
}

/**
 * Composites the icon onto a solid canvas and writes a 24-bit BMP.
 *
 * Bottom-up rows and each row padded to a multiple of four bytes, which is what
 * every BMP reader expects and what NSIS in particular refuses to guess at.
 */
function write(path, canvasWidth, canvasHeight, background, icon, size, centreY) {
  const pixels = Buffer.alloc(canvasWidth * canvasHeight * 3);
  for (let i = 0; i < canvasWidth * canvasHeight; i += 1) {
    pixels[i * 3] = background[2];
    pixels[i * 3 + 1] = background[1];
    pixels[i * 3 + 2] = background[0];
  }

  const left = Math.round((canvasWidth - size) / 2);
  const top = Math.round(centreY - size / 2);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = sample(icon, (x / size) * icon.width, (y / size) * icon.height);
      if (a === 0) continue;
      const cx = left + x;
      const cy = top + y;
      if (cx < 0 || cy < 0 || cx >= canvasWidth || cy >= canvasHeight) continue;
      const at = (cy * canvasWidth + cx) * 3;
      // Straight alpha over the background. The icon is a white squircle whose
      // edge is antialiased against nothing, so blending is what keeps that
      // edge from turning into a ring of grey.
      const mix = (channel, over) => Math.round((over * a + channel * (255 - a)) / 255);
      pixels[at] = mix(background[2], b);
      pixels[at + 1] = mix(background[1], g);
      pixels[at + 2] = mix(background[0], r);
    }
  }

  const rowBytes = canvasWidth * 3;
  const padding = (4 - (rowBytes % 4)) % 4;
  const body = Buffer.alloc((rowBytes + padding) * canvasHeight);
  for (let y = 0; y < canvasHeight; y += 1) {
    // BMP rows run bottom to top.
    const source = (canvasHeight - 1 - y) * rowBytes;
    pixels.copy(body, y * (rowBytes + padding), source, source + rowBytes);
  }

  const header = Buffer.alloc(54);
  header.write("BM", 0, "ascii");
  header.writeUInt32LE(54 + body.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(canvasWidth, 18);
  header.writeInt32LE(canvasHeight, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(body.length, 34);

  writeFileSync(path, Buffer.concat([header, body]));
  console.log(`${path}  ${canvasWidth}x${canvasHeight}`);
}

const icon = decodePng(join(ICONS, "128x128@2x.png"));

// The panel is the app's dark surface with the icon high on it, where a wizard
// puts its artwork and where the text below it will not collide.
write(join(ICONS, "installer-sidebar.bmp"), 164, 314, DARK, icon, 104, 118);

// The header sits beside the page title on a white page, so it is white: a dark
// strip there reads as a rendering fault rather than as branding.
write(join(ICONS, "installer-header.bmp"), 150, 57, WHITE, icon, 44, 28);
