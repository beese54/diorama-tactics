import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11'], defaultViewport: { width: 1920, height: 1080 } });
for (const size of process.argv.slice(2)) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:5173/?map=world&seed=4242&size=${size}&weather=clear&time=day`);
  await page.waitForFunction(() => window.__map, { timeout: 600000 });
  await new Promise((r) => setTimeout(r, 1000));
  console.log(size, JSON.stringify(await page.evaluate(() => window.__map.triangles())), JSON.stringify(await page.evaluate(() => window.__map.renderInfo())));
  await page.close();
}
await browser.close();
