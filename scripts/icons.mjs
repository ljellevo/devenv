// Renders build/icon.svg and build/tray.svg to the PNG/ICNS files the app ships with. Run after editing either SVG.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = await chromium.launch();
async function render(svgPath, size, out) {
  const svg = (await readFile(svgPath, 'utf8')).replace(/<svg([^>]*?) width="\d+" height="\d+"/, '<svg$1 width="100%" height="100%"');
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;background:transparent">${svg}</body></html>`);
  await writeFile(out, await page.screenshot({ omitBackground: true }));
  await page.close();
}

const iconset = join(await mkdtemp(join(tmpdir(), 'devenv-icon-')), 'icon.iconset');
execFileSync('mkdir', [iconset]);
for (const size of [16, 32, 128, 256, 512]) {
  await render('build/icon.svg', size, join(iconset, `icon_${size}x${size}.png`));
  await render('build/icon.svg', size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', 'build/icon.icns']);
await render('build/icon.svg', 1024, 'build/icon.png');
await render('build/tray.svg', 18, 'src/main/trayTemplate.png');
await render('build/tray.svg', 36, 'src/main/trayTemplate@2x.png');
await rm(join(iconset, '..'), { recursive: true });
await browser.close();
