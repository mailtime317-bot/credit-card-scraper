import { firefox } from 'playwright';
import fs from 'fs';
import axios from 'axios';
import { formatData } from './formatData.js';

if (!fs.existsSync('./images')) {
  fs.mkdirSync('./images', { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const downloadImage = async (imgUrl, imgName) => {
  const response = await axios.get(imgUrl, { responseType: 'stream' });
  const writer = fs.createWriteStream(imgName);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

function formatString(str) {
  const formattedStr = str.replace(/[^a-zA-Z0-9\s]/g, '');
  return formattedStr.replace(/\s+/g, '-');
}

const scrape = async (fileName, url) => {
  const headless = process.env.HEADLESS === "false" ? false : true;
  const browser = await firefox.launch({ headless });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // increase navigation timeout and retry once if it times out
  page.setDefaultNavigationTimeout(60000);

  const tryGoto = async () => {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return true;
    } catch (e) {
      console.warn('first navigation attempt failed:', e.message || e);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        return true;
      } catch (e2) {
        console.error('second navigation attempt failed:', e2.message || e2);
        return false;
      }
    }
  };

  const navigated = await tryGoto();
  if (!navigated) {
    await browser.close();
    throw new Error('Navigation failed after retries');
  }

  const wrapper = await page.$('.wpgb-viewport');
  if (!wrapper) {
    console.error('Could not find .wpgb-viewport on page');
    await browser.close();
    return;
  }

  const articles = await wrapper.$$('article');
  const results = [];

  for (const article of articles) {
    try {
      await sleep(300 + Math.floor(Math.random() * 700));
      const cardName = await article.$eval('.wpgb-block-1 a', (n) => n.innerText).catch(() => null);
      const cardReward = await article.$eval('.wpgb-block-2', (n) => n.innerText).catch(() => null);
      const imgLink = await article.$eval('.wpgb-card-media-thumbnail a', (a) => a.href).catch(() => null);

      if (!cardName) continue;

      const imgName = `${formatString(cardName)}-image.png`;
      if (imgLink) {
        try {
          await downloadImage(imgLink, `./images/${imgName}`);
        } catch (e) {
          console.warn('image download failed', e.message || e);
        }
      }

      // balance is a placeholder — personal account balances or PII are not collected
      results.push({ cardName, cardReward, cardImage: imgName, balance: null });
    } catch (e) {
      console.warn('article parse error', e.message || e);
    }
  }

  await fs.promises.writeFile(`${fileName}.json`, JSON.stringify(results));
  console.log(`Saved ${fileName}.json (${results.length} items)`);
  await browser.close();
  await formatData(fileName);
};

const fileArg = process.argv[2] || 'cad-result-firefox';
const urlArg = process.argv[3] || 'https://frugalflyer.ca/compare-credit-cards/';

scrape(fileArg, urlArg).catch((err) => console.error('playwright scrape failed', err.message || err));
