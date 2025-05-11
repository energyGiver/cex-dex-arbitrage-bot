require('dotenv').config();
const { ethers } = require('ethers');

const config = {
    binance: {
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
    },
    networks: {
        ethereum: {
            name: 'Ethereum',
            rpcUrl: process.env.ETH_MAINNET_RPC_URL,
            chainId: 1,
            provider: null, // Will be initialized
        },
        arbitrum: {
            name: 'Arbitrum',
            rpcUrl: process.env.ARBITRUM_RPC_URL,
            chainId: 42161,
            provider: null,
        },
        optimism: {
            name: 'Optimism',
            rpcUrl: process.env.OPTIMISM_RPC_URL,
            chainId: 10,
            provider: null,
        },
        polygon: {
            name: 'Polygon',
            rpcUrl: process.env.POLYGON_RPC_URL,
            chainId: 137,
            provider: null,
        },
    },
    wallet: {
        privateKey: process.env.PRIVATE_KEY,
    },
    trading: {
        minimumProfitPercentage: parseFloat(process.env.MINIMUM_PROFIT_PERCENTAGE || '0.5'),
        maxSlippagePercentage: parseFloat(process.env.MAX_SLIPPAGE_PERCENTAGE || '0.5'),
        gasLimit: parseInt(process.env.GAS_LIMIT || '500000'),
        gasPriceMultiplier: parseFloat(process.env.GAS_PRICE_MULTIPLIER || '1.1'),
        tradingPairs: (process.env.TRADING_PAIRS || 'ETH-USDT,WBTC-USDT,LINK-USDT').split(','),
    },
    dex: {
        uniswapV3Router: process.env.UNISWAP_V3_ROUTER || '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        sushiswapRouter: process.env.SUSHISWAP_ROUTER || '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
    },
    server: {
        port: parseInt(process.env.PORT || '3000'),
        logLevel: process.env.LOG_LEVEL || 'info',
    },
};

// Initialize providers
Object.keys(config.networks).forEach(network => {
    if (config.networks[network].rpcUrl) {
        config.networks[network].provider = new ethers.JsonRpcProvider(
            config.networks[network].rpcUrl
        );
    }
});

module.exports = config; 