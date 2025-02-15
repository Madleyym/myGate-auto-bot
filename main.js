import { WebSocket } from "ws";
import axios from "axios";
import { randomUUID } from "crypto";
import { HttpsProxyAgent } from "https-proxy-agent";
import fs from "fs";
import chalk from "chalk";

const logger = {
  getCurrentTimestamp() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
  },
  log: (level, message, value = "") => {
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const username = "Madleyym";
    console.log(
      `[ Mygate-Node ] [${username}] [${timestamp}] [ ${level.toUpperCase()} ] ${message} ${value}`
    );
  },
  info: (message, value = "") => logger.log("info", message, value),
  warn: (message, value = "") => logger.log("warn", message, value),
  error: (message, value = "") => logger.log("error", message, value),
  success: (message, value = "") => logger.log("success", message, value),
};

const headers = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://app.mygate.network",
  Referer: "https://app.mygate.network/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

class NodeConnection {
  constructor(token, proxy, uuid) {
    this.token = token;
    this.proxy = proxy;
    this.uuid = uuid;
    this.ws = null;
    this.connected = false;
    this.agent = new HttpsProxyAgent(proxy);
    this.pingInterval = null;
    this.reconnectTimeout = null;
  }

  async connect() {
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

      this.ws.on("open", () => {
        this.connected = true;
        logger.success(`Node ${this.uuid} connected using proxy ${this.proxy}`);
        this.sendAuth();
        this.startPing();
      });

      this.ws.on("message", (data) => {
        const msg = data.toString();
        if (msg === "2") {
          this.ws.send("3"); // Respond to ping
        } else {
          logger.info(`Node ${this.uuid} received:`, msg);
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
    } catch (error) {
      logger.error(`Failed to connect node ${this.uuid}:`, error.message);
      this.scheduleReconnect();
    }
  }

  sendAuth() {
    const auth = `40{"token":"Bearer ${this.token}"}`;
    this.ws.send(auth);
    logger.info(`Node ${this.uuid} sent auth`);
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      if (this.connected) {
        try {
          this.ws.send("2");
        } catch (error) {
          logger.error(
            `Failed to send ping for node ${this.uuid}:`,
            error.message
          );
          this.cleanup();
          this.scheduleReconnect();
        }
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
    this.reconnectTimeout = setTimeout(() => {
      logger.info(`Attempting to reconnect node ${this.uuid}`);
      this.connect();
    }, 5000);
  }
}

async function registerNode(token, proxy) {
  try {
    const uuid = randomUUID();
    const response = await axios.post(
      "https://api.mygate.network/api/front/nodes",
      {
        id: uuid,
        status: "Good",
        activationDate: new Date().toISOString(),
      },
      {
        headers: {
          ...headers,
          Authorization: `Bearer ${token}`,
        },
        httpsAgent: new HttpsProxyAgent(proxy),
      }
    );

    if (response.status === 200) {
      logger.success(`Registered new node: ${uuid}`);
      return uuid;
    }
  } catch (error) {
    logger.error("Failed to register node:", error.message);
  }
  return null;
}

async function main() {
  try {
    console.clear();
    console.log("\n==========================================");
    console.log("           MyGate Bot v1.0");
    console.log("==========================================\n");

    // Read token
    const token = fs.readFileSync("tokens.txt", "utf8").trim();
    if (!token) {
      throw new Error("No token found in tokens.txt");
    }

    // Read proxies
    const proxies = fs
      .readFileSync("proxy.txt", "utf8")
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p);

    if (proxies.length === 0) {
      throw new Error("No proxies found in proxy.txt");
    }

    logger.info(`Found ${proxies.length} proxies`);

    // Create nodes
    const nodes = [];
    for (let i = 0; i < proxies.length; i++) {
      const proxy = proxies[i];
      const uuid = await registerNode(token, proxy);

      if (uuid) {
        const node = new NodeConnection(token, proxy, uuid);
        nodes.push(node);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Delay between registrations
      }
    }

    // Connect all nodes
    logger.info(`Connecting ${nodes.length} nodes...`);
    for (const node of nodes) {
      await node.connect();
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Delay between connections
    }

    // Monitor connections
    setInterval(() => {
      const connected = nodes.filter((n) => n.connected).length;
      logger.info(
        `Connection status: ${connected}/${nodes.length} nodes connected`
      );
    }, 30000);

    logger.success("Bot is running");
    logger.info("Press Ctrl+C to stop");

    process.on("SIGINT", () => {
      logger.info("Shutting down...");
      nodes.forEach((node) => node.cleanup());
      process.exit(0);
    });
  } catch (error) {
    logger.error("Critical error:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Fatal error:", error.message);
  process.exit(1);
});
