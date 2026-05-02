import puppeteer from "puppeteer";
import EventEmitter from "events";

class BrowserPool extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxBrowsers = options.maxBrowsers || 3;
    this.maxPagesPerBrowser = options.maxPagesPerBrowser || 2;
    this.browsers = [];
    this.availablePages = [];
    this.activeBrowsers = 0;
    this.activePages = 0;
    this.browserOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--memory-pressure-off",
        "--max-old-space-size=4096",
      ],
      ...options.puppeteerOptions,
    };
  }

  async initialize() {
    console.log(`Initializing browser pool with ${this.maxBrowsers} browsers`);

    await this.createBrowser();
  }

  async createBrowser() {
    if (this.activeBrowsers >= this.maxBrowsers) {
      throw new Error("Maximum number of browsers reached");
    }

    try {
      const browser = await puppeteer.launch(this.browserOptions);
      const browserInfo = {
        browser,
        pages: [],
        activePages: 0,
        id: `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      browser.on("disconnected", () => {
        console.log(`Browser ${browserInfo.id} disconnected`);
        this.removeBrowser(browserInfo);
      });

      this.browsers.push(browserInfo);
      this.activeBrowsers++;

      console.log(
        `Browser ${browserInfo.id} created. Active browsers: ${this.activeBrowsers}`,
      );
      return browserInfo;
    } catch (error) {
      console.error("Error creating browser:", error);
      throw error;
    }
  }

  async createPage(browserInfo) {
    if (browserInfo.activePages >= this.maxPagesPerBrowser) {
      return null;
    }

    try {
      const page = await browserInfo.browser.newPage();
      await page.setViewport({
        width: 1000,
        height: 1000,
        deviceScaleFactor: 2,
      });

      const pageInfo = {
        page,
        browserInfo,
        id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        inUse: false,
        createdAt: new Date(),
      };

      browserInfo.pages.push(pageInfo);
      browserInfo.activePages++;
      this.activePages++;

      console.log(
        `Page ${pageInfo.id} created in ${browserInfo.id}. Active pages: ${this.activePages}`,
      );
      return pageInfo;
    } catch (error) {
      console.error("Error creating page:", error);
      throw error;
    }
  }

  async getPage() {
    let availablePage = this.findAvailablePage();

    if (availablePage) {
      availablePage.inUse = true;
      return availablePage;
    }

    for (const browserInfo of this.browsers) {
      if (browserInfo.activePages < this.maxPagesPerBrowser) {
        try {
          const pageInfo = await this.createPage(browserInfo);
          pageInfo.inUse = true;
          return pageInfo;
        } catch (error) {
          console.error("Error creating page in existing browser:", error);
          continue;
        }
      }
    }

    if (this.activeBrowsers < this.maxBrowsers) {
      try {
        const browserInfo = await this.createBrowser();
        const pageInfo = await this.createPage(browserInfo);
        pageInfo.inUse = true;
        return pageInfo;
      } catch (error) {
        console.error("Error creating new browser:", error);
      }
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timeout waiting for an available page."));
      }, 30000);

      const checkAvailability = () => {
        const page = this.findAvailablePage();
        if (page) {
          clearTimeout(timeoutId);
          page.inUse = true;
          resolve(page);
        } else {
          setImmediate(checkAvailability);
        }
      };

      checkAvailability();
    });
  }

  findAvailablePage() {
    for (const browserInfo of this.browsers) {
      for (const pageInfo of browserInfo.pages) {
        if (!pageInfo.inUse) {
          return pageInfo;
        }
      }
    }
    return null;
  }

  removePage(pageInfo) {
    const browserInfo = pageInfo.browserInfo;
    if (!browserInfo) return;

    const pageIndex = browserInfo.pages.indexOf(pageInfo);
    if (pageIndex > -1) {
      browserInfo.pages.splice(pageIndex, 1);
      browserInfo.activePages--;
      this.activePages--;
      console.log(
        `Page ${pageInfo.id} removed from pool. Active pages: ${this.activePages}`,
      );
    }
  }

  async closeAndRemovePage(pageInfo) {
    try {
      if (!pageInfo.page.isClosed()) {
        await pageInfo.page.close();
      }
    } catch (e) {
      console.warn(`Warning: error closing page ${pageInfo.id}: ${e.message}`);
    }
    this.removePage(pageInfo);
  }

  async releasePage(pageInfo) {
    if (!pageInfo) return;

    if (pageInfo.page.isClosed()) {
      console.warn(
        `Page ${pageInfo.id} was already closed. Removing from pool.`,
      );
      this.removePage(pageInfo);
      return;
    }

    if (pageInfo.inUse) {
      try {
        await pageInfo.page.goto("about:blank");
        pageInfo.inUse = false;
        console.log(`Page ${pageInfo.id} released and reset for reuse.`);
      } catch (error) {
        console.error(
          `Error resetting page ${pageInfo.id}, closing it instead:`,
          error.message,
        );

        await this.closeAndRemovePage(pageInfo);
      }
    }
  }

  removeBrowser(browserInfo) {
    const index = this.browsers.indexOf(browserInfo);
    if (index > -1) {
      this.browsers.splice(index, 1);
      this.activeBrowsers--;
      this.activePages -= browserInfo.activePages;
      console.log(
        `Browser ${browserInfo.id} removed. Active browsers: ${this.activeBrowsers}`,
      );
    }
  }

  async closeAll() {
    console.log("Closing all browsers in pool");
    const closePromises = this.browsers.map(async (browserInfo) => {
      try {
        await browserInfo.browser.close();
      } catch (error) {
        console.error(`Error closing browser ${browserInfo.id}:`, error);
      }
    });

    await Promise.all(closePromises);
    this.browsers = [];
    this.activeBrowsers = 0;
    this.activePages = 0;
    console.log("All browsers closed");
  }

  getStats() {
    return {
      activeBrowsers: this.activeBrowsers,
      activePages: this.activePages,
      availablePages: this.browsers.reduce(
        (count, browser) =>
          count + browser.pages.filter((p) => !p.inUse).length,
        0,
      ),
      maxBrowsers: this.maxBrowsers,
      maxPagesPerBrowser: this.maxPagesPerBrowser,
    };
  }
}

export default BrowserPool;
