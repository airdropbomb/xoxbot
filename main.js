const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, saveToken, isTokenExpired, saveJson, updateEnv, getRandomNumber, decodeJWT } = require("./utils");
const { checkBaseUrl } = require("./checkAPI");
const headers = require("./core/header");

// Configuration variables from your original code
const SKIP_TASKS = [];
const BASE_URL = "https://api.x.ink/v1";
const ENABLE_DEBUG = false;
const ADVANCED_ANTI_DETECTION = false;
const DELAY_BETWEEN_REQUESTS = [1, 5];
const DELAY_START_BOT = [1, 5];
const TIME_SLEEP = 1440;
const MAX_THREADS = 50;
const MAX_THREADS_NO_PROXY = 1;

class ClientAPI {
  constructor(accountIndex, initData, session_name, baseURL) {
    this.accountIndex = accountIndex;
    this.queryId = initData;
    this.headers = headers;
    this.session_name = session_name;
    this.session_user_agents = this.#load_session_data();
    this.baseURL = baseURL;
    this.token = initData;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Creating user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127"`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Account ${this.accountIndex + 1}]`;
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async makeRequest(url, method, data = {}, options = { retries: 1, isAuth: false }) {
    const { retries, isAuth } = options;

    const headers = { ...this.headers };

    if (!isAuth) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    let currRetries = 0,
      success = false;
    do {
      try {
        const response = await axios({
          method,
          url: `${url}`,
          data,
          headers,
          timeout: 30000,
        });
        success = true;
        if (response?.data?.data) return { success: true, data: response.data.data };
        return { success: true, data: response.data };
      } catch (error) {
        if (error.status == 400) {
          this.log(`Invalid request for ${url}, maybe there is a new update from the server | contact: https://t.me/airdropbombnode to get the new update!`, "error");
          process.exit(0);
        }
        this.log(`Request failed: ${url} | ${error.message} | retrying...`, "warning");
        success = false;
        await sleep(DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { success: false, error: error.message };
      }
      currRetries++;
    } while (currRetries <= retries && !success);
  }

  async getUserInfo() {
    return this.makeRequest(`${this.baseURL}/me`, "get");
  }

  async checkin() {
    return this.makeRequest(`${this.baseURL}/check-in`, "post", {});
  }

  async getSpin() {
    return this.makeRequest(`${this.baseURL}/my-spinRecords`, "get");
  }

  async spin() {
    return this.makeRequest(`${this.baseURL}/draw`, "post", {});
  }

  async handleCheckIn() {
    const checkinResult = await this.checkin();
    if (checkinResult.success) {
      this.log(`Check-in successful! Reward: ${checkinResult.data?.pointsEarned}`, "success");
    } else {
      this.log("Check-in failed!", "warning");
    }
  }

  async getValidToken() {
    const existingToken = this.token;

    const isExp = isTokenExpired(existingToken);
    if (existingToken && !isExp) {
      this.log("Using valid token", "success");
      return existingToken;
    } else {
      this.log("Token expired...", "warning");
      saveJson(this.session_name, this.token, "tokenExp.json");
      return null;
    }
  }

  async processAccount() {
    const token = await this.getValidToken();
    if (!token) return this.log(`Can't get token for account ${this.accountIndex + 1}, skipping...`, "error");

    let userData = { success: false, data: null },
      retries = 0;
    do {
      userData = await this.getUserInfo();
      if (userData?.success) break;
      retries++;
    } while (retries < 2);

    if (userData.success) {
      const userInfo = userData.data;
      const { check_in_count, points, lastCheckIn, currentDraws } = userInfo;
      this.log(`Wallet: ${this.session_name} | Points: ${points} | Check-in Days: ${check_in_count} | Spins: ${currentDraws}`, "custom");
      if (!isCheckedInToday(lastCheckIn) || !lastCheckIn) {
        await sleep(1);
        await this.handleCheckIn();
      }
      if (currentDraws > 0) {
        let amountSpin = currentDraws;
        while (amountSpin > 0) {
          await sleep(1);
          amountSpin--;
          const resSpin = await this.spin();
          if (resSpin.success) {
            this.log(`Spin successful: +${resSpin.data?.pointsEarned} points`, "success");
          }
        }
      }
    } else {
      return this.log("Can't get user info...skipping", "error");
    }
  }
}

const isCheckedInToday = (checkInDate) => {
  const checkIn = new Date(checkInDate);
  const today = new Date();

  checkIn.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return checkIn.getTime() === today.getTime();
};

async function main() {
  console.clear();

  console.log(`
       █████╗ ██████╗ ██████╗     ███╗   ██╗ ██████╗ ██████╗ ███████╗
      ██╔══██╗██╔══██╗██╔══██╗    ████╗  ██║██╔═══██╗██╔══██╗██╔════╝
      ███████║██║  ██║██████╔╝    ██╔██╗ ██║██║   ██║██║  ██║█████╗  
      ██╔══██║██║  ██║██╔══██╗    ██║╚██╗██║██║   ██║██║  ██║██╔══╝  
      ██║  ██║██████╔╝██████╔╝    ██║ ╚████║╚██████╔╝██████╔╝███████╗
      ╚═╝  ╚═╝╚═════╝ ╚═════╝     ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝  
        By : ADB NODE
  `.white);

  console.log(colors.yellow("Tool modified by Telegram group (https://t.me/airdropbombnode)"));

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`Unable to find API ID, try again later!`.red);
  console.log(`${message}`.yellow);

  const data = loadData("tokens.txt");

  const maxThreads = MAX_THREADS_NO_PROXY;
  while (true) {
    for (let i = 0; i < data.length; i += maxThreads) {
      const batch = data.slice(i, i + maxThreads);

      const promises = batch.map(async (initData, indexInBatch) => {
        const info = decodeJWT(initData);
        const { walletAddress, exp } = info.payload;
        if (Math.floor(Date.now() / 1000) > exp) {
          console.log(`Account ${i + 1} | ${walletAddress} Token expired=============`.yellow);
          return null;
        }
        const accountIndex = i + indexInBatch;
        const session_name = walletAddress;
        console.log(`=========Account ${accountIndex + 1} | ${walletAddress}`.green);
        const client = new ClientAPI(accountIndex, initData, session_name, hasIDAPI);
        client.set_headers();

        return timeout(client.processAccount(), 24 * 60 * 60 * 1000).catch((err) => {
          client.log(`Error processing account: ${err.message}`, "error");
        });
      });
      await Promise.allSettled(promises);
    }
    await sleep(5);
    console.log(`Completed all accounts | Waiting ${TIME_SLEEP} minutes=============`.magenta);
    await sleep(TIME_SLEEP * 60);
  }
}

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout"));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
