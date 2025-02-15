import { WebSocket } from "ws";
import axios from "axios";
import { randomUUID } from "crypto";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import fs from "fs";
import chalk from "chalk";

// Logger configuration
const logger = {
  getCurrentTimestamp() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
  },

  getEmoji(level) {
    const emojis = {
      info: "ℹ️ ",
      warn: "⚠️ ",
      error: "❌ ",
      success: "✅ ",
    };
    return emojis[level] || "";
  },

  getColor(level) {
    const colors = {
      info: chalk.blue,
      warn: chalk.yellow,
      error: chalk.red,
      success: chalk.green,
    };
    return colors[level] || chalk.white;
  },

  formatMessage(level, message, value = "") {
    const timestamp = this.getCurrentTimestamp();
    const username = chalk.cyan("Madleyym");
    const emoji = this.getEmoji(level);
    const color = this.getColor(level);
    const valueStr = value ? ` ${value}` : "";

    return `${chalk.gray(timestamp)} ${username} ${emoji}${color(
      message
    )}${valueStr}`;
  },

  log(level, message, value = "") {
    console.log(this.formatMessage(level, message, value));
  },

  info: (message, value = "") => logger.log("info", message, value),
  warn: (message, value = "") => logger.log("warn", message, value),
  error: (message, value = "") => logger.log("error", message, value),
  success: (message, value = "") => logger.log("success", message, value),

  printHeader() {
    console.clear();
    const border = chalk.cyan("═".repeat(50));
    const title = chalk.bold.white("MyGate Bot v1.0");
    console.log(`\n${border}`);
    console.log(`${" ".repeat(19)}${title}`);
    console.log(`${border}\n`);
  },
};

// Headers configuration
const headers = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://app.mygate.network",
  Referer: "https://app.mygate.network/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

function getProxyAgent(proxyString) {
  try {
    if (!proxyString) {
      throw new Error("Empty proxy string");
    }

    const isSocks = proxyString.startsWith("socks5://");

    // Create agent based on protocol with minimal configuration
    return isSocks
      ? new SocksProxyAgent(proxyString)
      : new HttpsProxyAgent(proxyString);
  } catch (error) {
    logger.error(`Failed to create proxy agent: ${error.message}`);
    throw error; // Re-throw to handle in calling function
  }
}

function isValidProxyFormat(proxy) {
  try {
    if (!proxy || typeof proxy !== "string") return false;

    // Basic protocol check
    if (!proxy.startsWith("http://") && !proxy.startsWith("socks5://")) {
      return false;
    }

    // Basic format check: protocol://user:pass@host:port
    const regex = /^(http|socks5):\/\/[^:]+:[^@]+@[^:]+:\d+$/;
    if (!regex.test(proxy)) {
      return false;
    }

    // Port number check
    const port = parseInt(proxy.split(":").pop(), 10);
    return !isNaN(port) && port > 0 && port <= 65535;
  } catch {
    return false;
  }
}

async function validateProxy(proxy) {
  try {
    if (!proxy) return false;

    const agent = getProxyAgent(proxy);
    if (!agent) return false;

    const config = {
      method: "GET",
      url: "https://api.mygate.network",
      httpsAgent: agent,
      proxy: false,
      timeout: 10000,
      headers: {
        ...headers,
        Connection: "keep-alive",
      },
      validateStatus: null, // Allow any status to be handled in code
    };

    const response = await axios(config);
    return response.status >= 200 && response.status < 500;
  } catch (error) {
    logger.warn(`Proxy validation failed for ${proxy}: ${error.message}`);
    return false;
  }
}

async function validateToken(token, proxy) {
  try {
    const agent = getProxyAgent(proxy);
    if (!agent) return false;

    const config = {
      method: "GET",
      url: "https://api.mygate.network/api/front/user",
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
        Connection: "keep-alive",
      },
      httpsAgent: agent,
      proxy: false,
      timeout: 15000,
      validateStatus: null,
    };

    const response = await axios(config);

    if (response.status === 200) {
      return true;
    }

    if (response.status === 401) {
      throw new Error("Invalid or expired token");
    }

    return false;
  } catch (error) {
    logger.warn(`Token validation failed for ${proxy}: ${error.message}`);
    return false;
  }
}
async function testProxy(proxy) {
  try {
    if (!isValidProxyFormat(proxy)) {
      logger.warn(`Invalid proxy format: ${proxy}`);
      return false;
    }

    const isWorking = await validateProxy(proxy);
    if (isWorking) {
      logger.success(`Proxy working: ${proxy}`);
      return true;
    }

    logger.warn(`Proxy not working: ${proxy}`);
    return false;
  } catch (error) {
    logger.error(`Error testing proxy ${proxy}: ${error.message}`);
    return false;
  }
}
async function registerNode(token, proxy) {
  try {
    const uuid = randomUUID();
    const agent = getProxyAgent(proxy);

    const response = await axios({
      method: "POST",
      url: "https://api.mygate.network/api/front/nodes",
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        id: uuid,
        status: "Good",
        activationDate: new Date().toISOString(),
      },
      httpsAgent: agent,
      proxy: false,
      timeout: 15000,
      validateStatus: (status) => status === 200 || status === 201,
    });

    if (response.status === 200 || response.status === 201) {
      logger.success(`Registered new node: ${uuid}`);
      return uuid;
    }
    return null;
  } catch (error) {
    logger.error(`Failed to register node: ${error.message}`);
    return null;
  }
}

class NodeConnection {
  constructor(token, proxy, uuid) {
    this.token = token;
    this.proxy = proxy;
    this.uuid = uuid;
    this.ws = null;
    this.connected = false;
    this.agent = getProxyAgent(proxy);
    this.pingInterval = null;
    this.reconnectTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.lastPingTime = null;
    this.lastPongTime = null;
  }

  async connect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts reached for node ${this.uuid}`);
      return;
    }

    try {
      const url = `wss://api.mygate.network/socket.io/?nodeId=${this.uuid}&EIO=4&transport=websocket`;

      this.ws = new WebSocket(url, {
        agent: this.agent,
        headers: {
          ...headers,
          Host: "api.mygate.network",
          Connection: "Upgrade",
          Upgrade: "websocket",
        },
        timeout: 30000,
      });

      this.setupWebSocketHandlers();
    } catch (error) {
      logger.error(`Connection failed for node ${this.uuid}:`, error.message);
      this.scheduleReconnect();
    }
  }

  setupWebSocketHandlers() {
    this.ws.on("open", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.success(`Node ${this.uuid} connected using proxy ${this.proxy}`);
      this.sendAuth();
      this.startPing();
    });

    this.ws.on("message", (data) => {
      const msg = data.toString();
      if (msg === "2") {
        this.handlePong();
      } else if (msg === "3") {
        this.lastPongTime = Date.now();
      } else if (msg.startsWith("40")) {
        logger.success(`Node ${this.uuid} authenticated`);
      }
    });

    this.ws.on("close", () => {
      logger.warn(`Node ${this.uuid} disconnected`);
      this.cleanup();
      this.scheduleReconnect();
    });

    this.ws.on("error", (error) => {
      logger.error(`Node ${this.uuid} error:`, error.message);
      this.cleanup();
      this.scheduleReconnect();
    });
  }

  handlePong() {
    this.lastPongTime = Date.now();
    this.ws.send("3");
  }

  sendAuth() {
    const auth = `40{"token":"Bearer ${this.token}"}`;
    this.ws.send(auth);
    logger.info(`Node ${this.uuid} sent auth`);
  }

  startPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (!this.connected || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        this.lastPingTime = Date.now();
        this.ws.send("2");

        if (this.lastPongTime && Date.now() - this.lastPongTime > 60000) {
          throw new Error("Ping timeout");
        }
      } catch (error) {
        logger.error(
          `Failed to send ping for node ${this.uuid}:`,
          error.message
        );
        this.cleanup();
        this.scheduleReconnect();
      }
    }, 25000);
  }

  cleanup() {
    this.connected = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch (error) {
        logger.error(
          `Error terminating connection for node ${this.uuid}:`,
          error.message
        );
      }
      this.ws = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      logger.info(
        `Attempting to reconnect node ${this.uuid} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
      this.connect();
    }, delay);
  }
}

async function main() {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    logger.printHeader();

    // Read and validate token
    if (!fs.existsSync("tokens.txt")) {
      throw new Error("tokens.txt file not found");
    }
    const token = fs.readFileSync("tokens.txt", "utf8").trim();
    if (!token) {
      throw new Error("No token found in tokens.txt");
    }

    // Read and validate proxies
    if (!fs.existsSync("proxy.txt")) {
      throw new Error("proxy.txt file not found");
    }

    // Read and filter proxies with basic validation
    const rawProxies = fs
      .readFileSync("proxy.txt", "utf8")
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    logger.info(`Found ${rawProxies.length} raw proxies`);

    // Validate proxy format
    const proxies = rawProxies.filter((proxy) => {
      const isValid = isValidProxyFormat(proxy);
      if (!isValid) {
        logger.warn(`Invalid proxy format: ${proxy}`);
      }
      return isValid;
    });

    if (proxies.length === 0) {
      throw new Error("No valid proxies found in proxy.txt");
    }

    logger.info(`Found ${proxies.length} valid formatted proxies`);
    logger.info("Testing proxies...");

    // Test proxies with retries
    const workingProxies = [];
    for (const proxy of proxies) {
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            logger.info(`Retry ${retryCount} for proxy: ${proxy}`);
          } else {
            logger.info(`Testing proxy: ${proxy}`);
          }

          const isWorking = await validateProxy(proxy);
          if (isWorking) {
            workingProxies.push(proxy);
            logger.success(`Proxy working: ${proxy}`);
            break;
          } else {
            logger.warn(`Proxy not working: ${proxy}`);
          }
        } catch (error) {
          logger.error(`Error testing proxy ${proxy}: ${error.message}`);
        }

        retryCount++;
        if (retryCount <= maxRetries) {
          await delay(2000); // Delay between retries
        }
      }

      await delay(1000); // Delay between different proxies
    }

    if (workingProxies.length === 0) {
      throw new Error("No working proxies found after testing");
    }

    logger.info(`Found ${workingProxies.length} working proxies`);

    // Validate token with working proxies
    logger.info("Validating token with working proxies...");
    const validatedProxies = [];

    for (const proxy of workingProxies) {
      try {
        const isValid = await validateToken(token, proxy);
        if (isValid) {
          validatedProxies.push(proxy);
          logger.success(`Token validated successfully with proxy: ${proxy}`);
        }
      } catch (error) {
        logger.warn(
          `Failed to validate token with proxy ${proxy}: ${error.message}`
        );
      }
      await delay(1000);
    }

    if (validatedProxies.length === 0) {
      throw new Error("Could not validate token with any working proxy");
    }

    // Create and register nodes with validated proxies
    logger.info("Registering nodes...");
    const nodes = [];
    const maxNodes = Math.min(validatedProxies.length, 5); // Limit max nodes

    for (let i = 0; i < maxNodes; i++) {
      const proxy = validatedProxies[i];
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          const uuid = await registerNode(token, proxy);
          if (uuid) {
            const node = new NodeConnection(token, proxy, uuid);
            nodes.push(node);
            logger.success(`Node registered successfully: ${uuid}`);
            break;
          }
        } catch (error) {
          logger.error(
            `Failed to register node with proxy ${proxy}: ${error.message}`
          );
        }

        retryCount++;
        if (retryCount <= maxRetries) {
          await delay(2000);
        }
      }
    }

    if (nodes.length === 0) {
      throw new Error("No nodes were successfully registered");
    }

    // Connect nodes with retry mechanism
    logger.info(`Connecting ${nodes.length} nodes...`);
    const connectedNodes = [];

    for (const node of nodes) {
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          await node.connect();
          connectedNodes.push(node);
          logger.success(`Node ${node.uuid} connected successfully`);
          break;
        } catch (error) {
          logger.error(`Failed to connect node ${node.uuid}: ${error.message}`);
        }

        retryCount++;
        if (retryCount <= maxRetries) {
          await delay(2000);
        }
      }
    }

    if (connectedNodes.length === 0) {
      throw new Error("No nodes could be connected");
    }

    // Monitor connections with improved error handling
    const monitorInterval = setInterval(() => {
      try {
        const connected = connectedNodes.filter((n) => n.connected).length;
        logger.info(
          `Connection status: ${connected}/${connectedNodes.length} nodes connected`
        );

        // Attempt to reconnect disconnected nodes
        connectedNodes.forEach((node) => {
          if (
            !node.connected &&
            node.reconnectAttempts < node.maxReconnectAttempts
          ) {
            node.connect().catch((error) => {
              logger.error(
                `Failed to reconnect node ${node.uuid}: ${error.message}`
              );
            });
          }
        });
      } catch (error) {
        logger.error(`Monitor error: ${error.message}`);
      }
    }, 30000);

    logger.success("Bot is running");
    logger.info("Press Ctrl+C to stop");

    // Improved cleanup
    const cleanup = async () => {
      logger.info("Shutting down...");
      clearInterval(monitorInterval);

      const cleanupPromises = connectedNodes.map(async (node) => {
        try {
          await node.cleanup();
          logger.info(`Node ${node.uuid} cleaned up`);
        } catch (error) {
          logger.error(`Failed to cleanup node ${node.uuid}: ${error.message}`);
        }
      });

      await Promise.all(cleanupPromises);
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    logger.error("Critical error:", error.message);
    process.exit(1);
  }
}

// Improved error handlers
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error.message);
  if (error.stack) {
    logger.error("Stack trace:", error.stack);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection at:", promise);
  logger.error("Reason:", reason);
});

// Start the application
main().catch((error) => {
  logger.error("Fatal error:", error.message);
  if (error.stack) {
    logger.error("Stack trace:", error.stack);
  }
  process.exit(1);
});
