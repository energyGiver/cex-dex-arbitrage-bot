# CEX-DEX Arbitrage Bot

An arbitrage trading bot that monitors price differences between centralized exchanges (Binance) and decentralized exchanges (Uniswap V3) on Ethereum and its Layer 2 networks. When a profitable trading opportunity is detected, the bot can automatically execute trades to capture the price difference.

## Features

- Monitors multiple token pairs between Binance (CEX) and Uniswap V3 (DEX)
- Supports Ethereum mainnet, Arbitrum, Optimism, and Polygon networks
- Real-time price data streaming from Binance
- Automatic arbitrage execution when profitable opportunities are detected
- REST API to monitor bot status and manually trigger actions
- Configuration of minimum profit thresholds, slippage tolerance, etc.
- Comprehensive logging for monitoring and debugging

## Architecture

The application follows a modular design for maintainability and scalability:

```
/
├── src/                    # Source code
│   ├── config/             # Configuration files
│   ├── exchange/           # CEX adapters (Binance)
│   ├── dex/                # DEX adapters (Uniswap)
│   ├── services/           # Core business logic
│   ├── utils/              # Utility functions
│   └── index.js            # Application entry point
├── .env                    # Environment variables (create from .env.example)
├── .env.example            # Example environment variables
├── package.json            # Project dependencies
└── README.md               # Project documentation
```

## Requirements

- Node.js 16 or higher
- Binance API key and secret with trading permissions
- Ethereum wallet with private key
- RPC endpoints for Ethereum and L2 networks
- Sufficient funds on both CEX and DEX wallets

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/cex-dex-arbitrage-bot.git
   cd cex-dex-arbitrage-bot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file from the example:
   ```
   cp .env.example .env
   ```

4. Configure your environment variables in the `.env` file:

```
# Binance API Configuration
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret

# Ethereum Network Configuration
ETH_MAINNET_RPC_URL=https://mainnet.infura.io/v3/your_infura_key
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/your_alchemy_key
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/your_alchemy_key
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your_alchemy_key

# Wallet Configuration
PRIVATE_KEY=your_private_key_for_dex_trading

# Trading Configuration
MINIMUM_PROFIT_PERCENTAGE=0.5
MAX_SLIPPAGE_PERCENTAGE=0.5
GAS_LIMIT=500000
GAS_PRICE_MULTIPLIER=1.1

# Token Pairs Configuration (comma-separated)
TRADING_PAIRS=ETH-USDT,WBTC-USDT,LINK-USDT

# DEX Router Addresses
UNISWAP_V3_ROUTER=0xE592427A0AEce92De3Edee1F18E0157C05861564
SUSHISWAP_ROUTER=0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F

# Server Configuration
PORT=3000
LOG_LEVEL=info
```

## Usage

Start the bot:

```
npm start
```

For development with automatic reloading:

```
npm run dev
```

## API Endpoints

The bot exposes a RESTful API to monitor status and control operations:

- `GET /health` - Check if the service is running
- `GET /api/status` - Get bot status
- `GET /api/opportunities` - List current arbitrage opportunities
- `GET /api/pairs` - List monitored trading pairs
- `GET /api/prices/cex/:symbol` - Get CEX price for a symbol
- `GET /api/prices/dex/:network/:baseToken/:quoteToken` - Get DEX price
- `POST /api/opportunities/find` - Manually trigger opportunity search
- `POST /api/opportunities/execute` - Manually execute an opportunity

## Security Considerations

- Never share your private key or API credentials
- Consider using a dedicated wallet with limited funds for testing
- Monitor the bot's activities regularly
- Start with a small trading amount when testing
- Consider setting up alerts for unusual trading activity

## Disclaimer

This software is for educational purposes only. Use at your own risk. The authors accept no responsibility for any losses incurred through the use of this software. Cryptocurrency trading involves significant risk and can result in the loss of your invested capital.

## License

MIT 