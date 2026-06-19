import axios from 'axios';
import fs from 'fs';
import { load } from 'cheerio';
import { formatData } from './formatData.js';

if (!fs.existsSync('./images')) fs.mkdirSync('./images', { recursive: true });

function formatString(str) {
  const formattedStr = str.replace(/[^a-zA-Z0-9\s]/g, '');
  return formattedStr.replace(/\s+/g, '-');
}

async function downloadImage(url, dest) {
  try {
    const resp = await axios.get(url, { responseType: 'stream' });
    const writer = fs.createWriteStream(dest);
    resp.data.pipe(writer);
    return new Promise((res, rej) => {
      writer.on('finish', res);
      writer.on('error', rej);
    });
  } catch (e) {
    console.warn('image download failed', e.message || e);
  }
}

const url = process.argv[2] || 'https://frugalflyer.ca/compare-credit-cards/';
const outFile = process.argv[3] || 'cad-result-html';

(async () => {
  console.log('Fetching', url);
  const resp = await axios.get(url, { timeout: 60000 });
  const $ = load(resp.data);

  const results = [];
  $('.wpgb-viewport article').each((i, el) => {
    try {
      const cardName = $(el).find('.wpgb-block-1 a').first().text().trim() || null;
      const cardReward = $(el).find('.wpgb-block-2').first().text().trim() || null;
      const imgLink = $(el).find('.wpgb-card-media-thumbnail a').attr('href') || null;
      if (!cardName) return;
      const imgName = `${formatString(cardName)}-image.png`;
      if (imgLink) downloadImage(imgLink, `./images/${imgName}`);
      results.push({ cardName, cardReward, cardImage: imgName, balance: null });
    } catch (e) {
      console.warn('parse error', e.message || e);
    }
  });

  await fs.promises.writeFile(`${outFile}.json`, JSON.stringify(results, null, 2));
  console.log(`Saved ${outFile}.json (${results.length} items)`);
  await formatData(outFile);
})();
