import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import puppeteer from 'puppeteer';

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// API key sederhana
app.use((req, res, next) => {
  const key = req.header('x-api-key');
  if (!process.env.API_KEY) return res.status(500).json({ error: 'API_KEY not set' });
  if (key !== process.env.API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

const CHROME_PATH = process.env.CHROME_PATH || undefined;

let browserPromise;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH, // biarkan undefined agar puppeteer pakai Chromium bawaannya
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
    });
  }
  return browserPromise;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/pdf', async (req, res) => {
  const { html, url, options = {} } = req.body || {};
  if (!html && !url) return res.status(400).json({ error: 'Provide "html" or "url"' });

  const {
    format = 'A4',
    landscape = false,
    printBackground = true,
    margin = { top:'0mm', right:'0mm', bottom:'0mm', left:'0mm' },
    displayHeaderFooter = false,
    headerTemplate,
    footerTemplate,
    waitUntil = 'networkidle0',
    viewport = { width: 1280, height: 800 },
    emulateMedia = 'screen',
    timeout = 120000,
    scale
  } = options;

  let page;
  try {
    const browser = await getBrowser();
    console.log('Browser opened', browser.wsEndpoint());
    page = await browser.newPage();
    await page.setViewport(viewport);
    console.log('Page opened', page.url());
    if (emulateMedia) await page.emulateMediaType(emulateMedia);

    if (html) await page.setContent(html, { waitUntil, timeout });
    else await page.goto(url, { waitUntil, timeout });

    const pdf = await page.pdf({
      format, landscape, printBackground, margin,
      displayHeaderFooter, headerTemplate, footerTemplate, scale
    });

    console.log('PDF created', pdf.length);

    await page.close();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (e) {
    try { if (page) await page.close(); } catch {}
    res.status(500).json({ error: 'Render failed', detail: String(e).slice(0,400) });
  }
});

process.on('SIGINT', async () => { if (browserPromise) (await browserPromise).close(); process.exit(0); });
process.on('SIGTERM', async () => { if (browserPromise) (await browserPromise).close(); process.exit(0); });

app.listen(process.env.PORT || 3000, () =>
  console.log(`Render service listening on :${process.env.PORT || 3000}`)
);
