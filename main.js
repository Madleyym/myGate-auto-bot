import { WebSocket } from "ws";
import axios from "axios";
import { randomUUID } from "crypto";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import fs from "fs";
import chalk from "chalk";

const headers = {
  Accept: "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  Origin: "https://app.mygate.network",
  Priority: "u=1, i",
  Referer: "https://app.mygate.network/",
  "Sec-CH-UA":
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-CH-UA-Mobile": "?0",
  "Sec-CH-UA-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

function readFile(pathFile) {
  try {
    const datas = fs
      .readFileSync(pathFile, "utf8")
      .split("\n")
      .map((data) => data.trim())
      .filter((data) => data.length > 0);
    return datas;
  } catch (error) {
    logger.error(`Error reading file: ${error.message}`);
    return [];
  }
}

const newAgent = (proxy = null) => {
  if (proxy && proxy.startsWith("http://")) {
    return new HttpsProxyAgent(proxy);
  } else if (proxy && proxy.startsWith("socks4://")) {
    return new SocksProxyAgent(proxy);
  } else if (proxy && proxy.startsWith("socks5://")) {
    return new SocksProxyAgent(proxy);
  } else {
    return null;
  }
};

class WebSocketClient {
  constructor(
    token,
    proxy = null,
    uuid,
    reconnectInterval = 5000,
    maxRetries = 5
  ) {
    this.maxRetries = maxRetries;
    this.retryCount = 0;
    this.token = token;
    this.proxy = proxy;
    this.socket = null;
    this.reconnectInterval = reconnectInterval;
    this.shouldReconnect = true;
    this.agent = newAgent(proxy);
    this.uuid = uuid;
    this.url = `wss://api.mygate.network/socket.io/?nodeId=${this.uuid}&EIO=4&transport=websocket`;
    this.regNode = `40{"token":"Bearer ${this.token}"}`;
    this.headers = {
      "Accept-encoding": "gzip, deflate, br, zstd",
      "Accept-language": "en-US,en;q=0.9,id;q=0.8",
      "Cache-control": "no-cache",
      Connection: "Upgrade",
      Host: "api.mygate.network",
      Origin: "chrome-extension://hajiimgolngmlbglaoheacnejbnnmoco",
      Pragma: "no-cache",
      "Sec-Websocket-Extensions": "permessage-deflate; client_max_window_bits",
      Upgrade: "websocket",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };
  }

  connect() {
    if (this.retryCount >= this.maxRetries) {
      logger.error(
        `Maximum reconnection attempts (${this.maxRetries}) reached for node ${this.uuid}`
      );
      return;
    }
    this.retryCount++;
    logger.info("Attempting connection:", this.uuid);
    this.socket = new WebSocket(this.url, {
      headers: this.headers,
      agent: this.agent,
    });

    this.socket.onopen = () => {
      logger.info("WebSocket connection established, node:", this.uuid);
      this.reply(this.regNode);
    };

    this.socket.onmessage = (event) => {
      if (event.data === "2" || event.data === "41") this.socket.send("3");
      else logger.info(`Node ${this.uuid} received message:`, event.data);
    };

    this.socket.onclose = () => {
      logger.warn("WebSocket connection closed, node:", this.uuid);
      if (this.shouldReconnect) {
        logger.warn(
          `Will reconnect in ${this.reconnectInterval / 1000} seconds, node:`,
          this.uuid
        );
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    };

    this.socket.onerror = (error) => {
      logger.error(`WebSocket error, node ${this.uuid}:`, error.message);
      this.socket.close();
    };
  }

  reply(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(String(message));
      logger.info("Replied:", message);
    } else {
      logger.error("Cannot send message; WebSocket not open.");
    }
  }

  disconnect() {
    this.shouldReconnect = false; // Changed from true to false
    if (this.socket) {
      this.socket.close();
    }
  }
}

async function registerNode(token, proxy = null, node = null) {
  const agent = newAgent(proxy);
  const maxRetries = 5;
  let retries = 0;
  let uuid = node || randomUUID();
  const activationDate = new Date().toISOString();
  const payload = {
    id: uuid,
    status: "Good",
    activationDate: activationDate,
  };

  while (retries < maxRetries) {
    try {
      const response = await axios.post(
        "https://api.mygate.network/api/front/nodes",
        payload,
        {
          headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
          },
          agent: agent,
        }
      );

      logger.info("Node registration successful:", response.data);
      return uuid;
    } catch (error) {
      logger.error("Error registering node:", error.message);
      retries++;
      if (retries < maxRetries) {
        logger.info("Retrying in 10 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      } else {
        logger.error("Maximum retries exceeded; abandoning registration.");
        return null;
      }
    }
  }
}

async function confirmUser(token, proxy = null) {
  const agent = newAgent(proxy);
  try {
    const response = await axios.post(
      "https://api.mygate.network/api/front/referrals/referral/LfBWAQ?",
      {},
      {
        headers: {
          ...headers,
          Authorization: `Bearer ${token}`,
        },
        agent: agent,
      }
    );
    logger.info("User confirmation response:", response.data);
    return null;
  } catch (error) {
    logger.info("Error confirming user:", error.message);
    return null;
  }
}

const getQuestsList = async (token, proxy = null) => {
  const maxRetries = 5;
  let retries = 0;
  const agent = newAgent(proxy);

  while (retries < maxRetries) {
    try {
      const response = await axios.get(
        "https://api.mygate.network/api/front/achievements/ambassador",
        {
          headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
          },
          agent: agent,
        }
      );
      const uncompletedIds = response.data.data.items
        .filter((item) => item.status === "UNCOMPLETED")
        .map((item) => item._id);
      return uncompletedIds;
    } catch (error) {
      retries++;
      if (retries < maxRetries) {
        logger.info("Retrying in 10 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      } else {
        logger.error("Maximum retries exceeded; abandoning quest retrieval.");
        return { error: error.message };
      }
    }
  }
};

async function submitQuest(token, proxy = null, questId) {
  const maxRetries = 5;
  let retries = 0;
  const agent = newAgent(proxy);
  while (retries < maxRetries) {
    try {
      const response = await axios.post(
        `https://api.mygate.network/api/front/achievements/ambassador/${questId}/submit?`,
        {},
        {
          headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
          },
          agent: agent,
        }
      );
      logger.info("Quest submission response:", response.data);
      return response.data;
    } catch (error) {
      logger.error("Error submitting quest:", error.message);
      retries++;
      if (retries < maxRetries) {
        logger.info("Retrying in 10 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      } else {
        logger.error("Maximum retries exceeded; abandoning quest submission.");
        return { error: error.message };
      }
    }
  }
}

async function getUserInfo(token, proxy = null) {
  const maxRetries = 5;
  let retries = 0;
  const agent = newAgent(proxy);

  while (retries < maxRetries) {
    try {
      const response = await axios.get(
        "https://api.mygate.network/api/front/users/me",
        {
          headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
          },
          agent: agent,
        }
      );
      const { name, status, _id, levels, currentPoint } = response.data.data;
      return { name, status, _id, levels, currentPoint };
    } catch (error) {
      retries++;
      if (retries < maxRetries) {
        logger.info("Retrying in 10 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      } else {
        logger.error(
          "Maximum retries exceeded; abandoning user info retrieval."
        );
        return { error: error.message };
      }
    }
  }
}

async function getUserNode(token, proxy = null, index) {
  try {
    const response = await axios.get(
      "https://api.mygate.network/api/front/nodes?limit=10&page=1",
      {
        headers: {
          ...headers,
          Authorization: `Bearer ${token}`,
        },
        agent: agent,
        timeout: 10000, // Add timeout
      }
    );
    return response.data.data.items.map((item) => item.id);
  } catch (error) {
    if (error.response?.status === 401) {
      logger.error(`Account #${index}: Token expired or invalid`);
      return null;
    }
    if (error.code === "ECONNABORTED") {
      logger.error(`Account #${index}: Request timeout`);
      return null;
    }
    logger.error(`Account #${index}: Unexpected error`, error.message);
    return null;
  }
}
const config = {
  QUEST_CHECK_INTERVAL: 6 * 60 * 60 * 1000, // 6 hours instead of 24
  RECONNECT_INTERVAL: 5000,
  MAX_RETRIES: 5,
  API_TIMEOUT: 10000,
  WEBSOCKET_PING_INTERVAL: 30000,
  REFERRAL_CODE: "LfBWAQ",
};

process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  // Close all WebSocket connections
  // Clear all intervals
  // Save any necessary state
  process.exit(0);
});

function isValidToken(token) {
  // Basic JWT format validation
  const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  return typeof token === "string" && jwtRegex.test(token);
}

const rateLimit = {
  lastRequest: 0,
  minInterval: 1000,
  async wait() {
    const now = Date.now();
    const timeToWait = Math.max(0, this.lastRequest + this.minInterval - now);
    if (timeToWait > 0) {
      await new Promise((resolve) => setTimeout(resolve, timeToWait));
    }
    this.lastRequest = Date.now();
  },
};

const checkQuests = async (token, proxy = null) => {
  logger.info("Attempting to check for new quests...");
  const questsIds = await getQuestsList(token, proxy);

  if (questsIds && questsIds.length > 0) {
    logger.info("Found new uncompleted quests:", questsIds.length);

    for (const questId of questsIds) {
      logger.info("Attempting to complete quest:", questId);
      try {
        await submitQuest(token, proxy, questId);
        logger.info(`Quest ${questId} completed successfully.`);
      } catch (error) {
        logger.error(`Error completing quest ${questId}:`, error);
      }
    }
  } else {
    logger.info("No new uncompleted quests found.");
  }
};

const logger = {
  log: (level, message, value = "") => {
    const now = new Date().toISOString();

    const colors = {
      info: chalk.green,
      warn: chalk.yellow,
      error: chalk.red,
      success: chalk.blue,
      debug: chalk.magenta,
    };

    const color = colors[level] || chalk.white;
    const levelTag = `[ ${level.toUpperCase()} ]`;
    const timestamp = `[ ${now} ]`;

    const formattedMessage = `${chalk.green(
      "[ Mygate-Node ]"
    )} ${chalk.cyanBright(timestamp)} ${color(levelTag)} ${message}`;

    let formattedValue = ` ${chalk.green(value)}`;
    if (level === "error") {
      formattedValue = ` ${chalk.red(value)}`;
    }
    if (typeof value === "object") {
      const valueColor = level === "error" ? chalk.red : chalk.green;
      formattedValue = ` ${valueColor(JSON.stringify(value))}`;
    }

    console.log(`${formattedMessage}${formattedValue}`);
  },
  info: (message, value = "") => logger.log("info", message, value),
  warn: (message, value = "") => logger.log("warn", message, value),
  error: (message, value = "") => logger.log("error", message, value),
  success: (message, value = "") => logger.log("success", message, value),
  debug: (message, value = "") => logger.log("debug", message, value),
};

async function main() {
  console.log("Starting script..."); // Add this line
  logger.info("Script initialized");

   const tokens = readFile("tokens.txt");
   console.log("Tokens loaded:", tokens.length); // Add this line

   const proxies = readFile("proxy.txt");
   console.log("Proxies loaded:", proxies.length); // Add this line

   if (tokens.length === 0) {
     logger.error("No tokens found in tokens.txt");
     return;
   }
  let proxyIndex = 0;

 try {
   logger.info(`Processing started, total ${tokens.length} accounts`);
   await Promise.all(
     tokens.map(async (token, index) => {
       const proxy = proxies.length > 0 ? proxies[proxyIndex] : null;
       if (proxies.length > 0) {
         proxyIndex = (proxyIndex + 1) % proxies.length;
       }

       logger.info("Attempting to get account nodes", `#${index + 1}`);
       let nodes = await getUserNode(token, proxy, index + 1);
       if (!nodes) return;
       if (nodes.length === 0) {
         logger.info("Account has no nodes - registering new node...");
         const uuid = await registerNode(token, proxy);
         if (!uuid) {
           logger.error(
             "Node registration failed - skipping WebSocket connection."
           );
           return;
         }
         nodes = [uuid];
       } else {
         logger.info(`Account #${index + 1} active nodes:`, nodes.length);
         await Promise.all(
           nodes.map((node) => registerNode(token, proxy, node))
         );
       }

       await confirmUser(token, proxy);
       setInterval(async () => {
         const users = await getUserInfo(token);
         logger.info(`Account #${index + 1} user information:`, {
           Active_Nodes: nodes.length,
           users,
         });
       }, 11 * 60 * 1000);

       await Promise.all(
         nodes.map((node) => {
           logger.info(
             `Attempting to open new connection for account #${
               index + 1
             } using proxy:`,
             proxy || "no proxy"
           );
           const client = new WebSocketClient(token, proxy, node);
           client.connect();

           setInterval(() => {
             client.disconnect();
           }, 10 * 60 * 1000);
         })
       );

       await checkQuests(token, proxy);
       setInterval(async () => {
         try {
           await checkQuests(token, proxy);
         } catch (error) {
           logger.error(
             `Error checking quests for account #${index + 1}:`,
             error.message
           );
         }
       }, 24 * 60 * 60 * 1000);

       const users = await getUserInfo(token, proxy);
       logger.info(`Account #${index + 1} user information:`, {
         Active_Nodes: nodes.length,
         users,
       });
     })
   );

   logger.info("All account connections established - maintaining operation.");
 } catch (error) {
   logger.error("Error in WebSocket connection:", error.message);
 }
}

export { main };

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log("Starting main function...");
    main().catch((error) => {
      console.error("Error in main:", error);
      process.exit(1);
    });
  } catch (error) {
    console.error("Critical error:", error);
    process.exit(1);
  }
}