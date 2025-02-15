# MyGate Bot v1.0

A Node.js bot for automating MyGate network node management and quest completion.

## Features

- Multi-account support
- Proxy support (HTTP, SOCKS4, SOCKS5)
- Automatic node registration and management
- WebSocket connection handling with auto-reconnect
- Quest automation and completion
- Detailed logging with colored output
- Rate limiting and error handling
- User information tracking

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js 18.x or higher
- npm or yarn package manager
- Git

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Madleyym/myGate-auto-bot.git
```

2. Navigate to the project directory:
```bash
cd myGate-auto-bot
```

3. Install dependencies:
```bash
npm install

# or if you're using yarn:
yarn install
```

4. Install required packages:
```bash
npm install ws axios crypto https-proxy-agent socks-proxy-agent chalk
```

## Setting Up Configuration Files

1. Create `tokens.txt` file in the project root:
```bash
touch tokens.txt
```
Add your MyGate tokens (one per line):
```
your_token_1_here
your_token_2_here
your_token_3_here
```

2. (Optional) Create `proxy.txt` for proxy support:
```bash
touch proxy.txt
```
Add your proxies (one per line):
```
http://ip:port
socks4://ip:port
socks5://ip:port
# or with authentication:
http://username:password@ip:port
```

## Running the Bot

1. Start the bot:
```bash
node index.js
```

2. The bot will automatically:
   - Load and validate your tokens
   - Connect to proxies if configured
   - Register nodes if needed
   - Start WebSocket connections
   - Monitor and complete quests
   - Display detailed status information

## Project Structure

```
myGate-auto-bot/
├── index.js          # Main bot file
├── tokens.txt        # Your MyGate tokens
├── proxy.txt         # Optional proxy list
├── package.json      # Project dependencies
└── README.md         # Documentation
```

## Monitoring and Logs

The bot provides detailed, color-coded logging:

- 🟢 Green: General information
- 🟡 Yellow: Warnings
- 🔴 Red: Errors
- 🔵 Blue: Success messages
- 🟣 Purple: Debug information

Example log output:
```
[ Mygate-Node ] [Username] [2024-02-15 10:30:15] [ INFO ] Starting process...
[ Mygate-Node ] [Username] [2024-02-15 10:30:16] [ SUCCESS ] Node registered successfully
```

## Configuration Options

You can modify the bot's behavior by adjusting these settings in `index.js`:

```javascript
const config = {
  QUEST_CHECK_INTERVAL: 6 * 60 * 60 * 1000, // Check quests every 6 hours
  RECONNECT_INTERVAL: 5000,                  // Reconnect every 5 seconds if disconnected
  MAX_RETRIES: 5,                            // Maximum retry attempts
  API_TIMEOUT: 10000,                        // API timeout (10 seconds)
  WEBSOCKET_PING_INTERVAL: 30000,            // WebSocket ping interval (30 seconds)
  REFERRAL_CODE: "LfBWAQ"                    // Referral code
};
```

## Error Handling

The bot includes robust error handling:
- Automatic WebSocket reconnection
- Request retry system
- Rate limiting
- Proxy rotation
- Detailed error logging

## Troubleshooting

Common issues and solutions:

1. `tokens.txt not found`:
   - Create tokens.txt in the project root
   - Add valid MyGate tokens

2. Connection errors:
   - Check your internet connection
   - Verify token validity
   - Try different proxies

3. WebSocket disconnections:
   - The bot will automatically attempt to reconnect
   - Check proxy stability if using proxies

4. Rate limiting:
   - The bot includes built-in rate limiting
   - Consider adding more proxies

## Security Recommendations

1. Keep your tokens secure:
   - Don't share tokens.txt
   - Don't commit tokens to Git

2. Proxy usage:
   - Use reliable proxy providers
   - Rotate proxies regularly
   - Use authenticated proxies when possible

## Contributing

1. Fork the repository
2. Create your feature branch:
```bash
git checkout -b feature/AmazingFeature
```
3. Commit your changes:
```bash
git commit -m 'Add some AmazingFeature'
```
4. Push to the branch:
```bash
git push origin feature/AmazingFeature
```
5. Open a Pull Request

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Disclaimer

This bot is for educational purposes only. Use at your own risk and ensure compliance with MyGate's terms of service.

## Support

If you encounter any issues or have questions:
1. Open an issue on GitHub
2. Check existing issues for solutions
3. Provide detailed information when reporting problems

## Updates

Stay updated with the latest version:
```bash
git pull origin main
npm install
```

## Author

- GitHub: [@Madleyym](https://github.com/Madleyym)

---

⭐ Don't forget to star the repository if you find it helpful!