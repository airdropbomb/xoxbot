const axios = require("axios");
const { log } = require("./utils"); // Adjust the path as necessary
const settings = require("./config/config");

const urlChecking = "https://raw.githubusercontent.com/Hunga9k50doker/APIs-checking/refs/heads/main/endpoints.json";

async function checkBaseUrl() {
  console.log("Checking api...".blue);
  if (settings.ADVANCED_ANTI_DETECTION) {
    const result = await getBaseApi(urlChecking);
    if (result.endpoint) {
      log("No change in api!", "success");
      return result;
    }
  } else {
    return {
      endpoint: settings.BASE_URL,
      message:
        "If the API changes, please contact the Telegram group (https://t.me/airdropbombnode) for more information and updates! | Have any issues, please contact: https://t.me/airdropbombnode",
    };
  }
}

async function getBaseApi(url) {
  try {
    const response = await axios.get(url);
    const content = response.data;
    if (content?.xstar) {
      return { endpoint: content.xstar, message: content.copyright };
    } else {
      return {
        endpoint: null,
        message:
          "If the API changes, please contact the Telegram group (https://t.me/airdropbombnode) for more information and updates! | Have any issues, please contact: https://t.me/airdropbombnode",
      };
    }
  } catch (e) {
    return {
      endpoint: null,
      message:
        "If the API changes, please contact the Telegram group (https://t.me/airdropbombnode) for more information and updates! | Have any issues, please contact: https://t.me/airdropbombnode",
    };
  }
}

module.exports = { checkBaseUrl };
