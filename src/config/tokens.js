/**
 * Token addresses for various networks
 * Used to interact with DEX pools
 */
module.exports = {
    ethereum: {
        WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    },
    arbitrum: {
        WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        LINK: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
        DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    },
    optimism: {
        WETH: '0x4200000000000000000000000000000000000006',
        USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
        LINK: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
        DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    },
    polygon: {
        WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
        LINK: '0xb0897686c545045aFc77CF20eC7A532E3120E0F1',
        DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    },

    // Get token address by network and symbol
    getTokenAddress(network, symbol) {
        if (!this[network] || !this[network][symbol]) {
            throw new Error(`Token ${symbol} not found for network ${network}`);
        }
        return this[network][symbol];
    },

    // Get token decimals (most ERC20 tokens use 18 decimals, USDT uses 6)
    getTokenDecimals(symbol) {
        const decimalMap = {
            USDT: 6,
            USDC: 6,
            DAI: 18,
            WETH: 18,
            ETH: 18,
            WBTC: 8,
            BTC: 8,
            LINK: 18,
        };

        return decimalMap[symbol] || 18;
    }
}; 