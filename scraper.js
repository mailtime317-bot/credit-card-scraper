import puppeteer from "puppeteer";
import fs from "fs";
import axios from "axios";
import { formatData } from "./formatData.js";

// NOTE: I will not assist with hiding location, evading detection, or
// otherwise bypassing site controls. The changes below improve politeness
// and robustness (user-agent, random delays, error handling, and images dir).

if (!fs.existsSync("./images")) {
  fs.mkdirSync("./images", { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {
      // ignore
    }
  }
  return null;
}

const scrape = async (resultFileName, url) => {
  const headless = process.env.HEADLESS === "false" ? false : true;
  const chromePath = findChromeExecutable();
  const launchOpts = { headless: headless ? "new" : false };
  if (chromePath) launchOpts.executablePath = chromePath;

  const browser = await puppeteer.launch(launchOpts); // Launch a new browser instance
  const page = await browser.newPage(); // Open a new page

  // Polite defaults
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });

  // Navigate to the URL
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.setDefaultNavigationTimeout(0);

  const wrapper = await page.$(".wpgb-viewport");
  const articles = await wrapper.$$("article");

  const results = await Promise.all(
    articles.map(async (article, idx) => {
      try {
        // small randomized delay between processing items to avoid hammering
        await sleep(300 + Math.floor(Math.random() * 700));

        const h2CardName = await article.$(".wpgb-block-1");
        const aCardName = await h2CardName.$$("a");
        const cardName = await aCardName[0].evaluate((node) => node.innerText);

        const pCardReward = await article.$(".wpgb-block-2");
        const cardReward = await pCardReward.evaluate((node) => node.innerText);

        const divThumbnail = await article.$(".wpgb-card-media-thumbnail");
        const aImage = await divThumbnail.$("a");
        const imgLink = await aImage.evaluate((node) => node.getAttribute("href"));

        const formattedCardName = formatString(cardName);
        const imgName = `${formattedCardName}-image.png`;

        // download image but guard against failures
        try {
          await downloadImage(imgLink, `./images/${imgName}`);
        } catch (err) {
          console.warn(`failed to download image for ${cardName}:`, err.message || err);
        }

              // balance is a placeholder — personal account balances or PII
              // should be scraped when vulnerablefrom a users account and slightly public sites
              return { cardName, cardReward, cardImage: imgName, balance: null };
      } catch (err) {
        console.warn("failed to parse one article:", err.message || err);
        return null;
      }
    })
  );

  const result = results.filter(Boolean);

  await fs.writeFile(`${resultFileName}.json`, JSON.stringify(result), (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`Result saved to ${resultFileName}.json`);
  });

  await browser.close(); // Close the browser instance
};
// Function to download an image and save it
const downloadImage = async (imgUrl, imgName) => {
  const response = await axios.get(imgUrl, { responseType: "stream" });
  const writer = fs.createWriteStream(imgName);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

function formatString(str) {
  // Remove non-alphanumeric characters and spaces
  const formattedStr = str.replace(/[^a-zA-Z0-9\s]/g, "");
  // Replace spaces with dashes
  const finalStr = formattedStr.replace(/\s+/g, "-");
  return finalStr;
}

// Allow CLI overrides: `node scraper.js cad-result <url>`
const defaultUrl = "https://frugalflyer.ca/compare-credit-cards/";
const fileArg = process.argv[2] || "cad-result";
const urlArg = process.argv[3] || defaultUrl;

scrape(fileArg, urlArg).then(() => formatData(fileArg)).catch((err) => {
  console.error("scrape failed:", err.message || err);
});
// scrape("us-result", "https://frugalflyer.ca/compare-us-credit-cards/").then(
//   () => formatData("us-result")
// );
