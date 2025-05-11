const { ethers } = require('ethers');
const logger = require('../utils/logger');
const config = require('../config/config');
const tokens = require('../config/tokens');
const BigNumber = require('bignumber.js');

// ABI for Uniswap V3 Quoter
const QUOTER_ABI = [
    'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
    'function quoteExactOutputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint160 sqrtPriceLimitX96) external returns (uint256 amountIn)'
];

// ABI for ERC20 token
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)'
];

// ABI for Uniswap V3 Router
const ROUTER_ABI = [
    'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)',
    'function exactOutputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn)'
];

// Common pools fees in Uniswap V3 (0.05%, 0.3%, 1%)
const POOL_FEES = {
    LOWEST: 500,   // 0.05%
    LOW: 3000,     // 0.3%
    MEDIUM: 10000, // 1%
};

class UniswapDEX {
    constructor() {
        this.prices = {};
        this.quoters = {};
        this.routers = {};
        this.wallet = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            logger.info('Initializing Uniswap DEX adapter');

            // Initialize wallet
            this.wallet = new ethers.Wallet(config.wallet.privateKey);

            // Initialize quoters and routers for each network
            for (const networkKey in config.networks) {
                const network = config.networks[networkKey];
                if (!network.provider) continue;

                const connectedWallet = this.wallet.connect(network.provider);

                // Initialize quoter
                const quoterAddress = this.getQuoterAddress(networkKey);
                this.quoters[networkKey] = new ethers.Contract(
                    quoterAddress,
                    QUOTER_ABI,
                    network.provider
                );

                // Initialize router
                const routerAddress = config.dex.uniswapV3Router;
                this.routers[networkKey] = new ethers.Contract(
                    routerAddress,
                    ROUTER_ABI,
                    connectedWallet
                );
            }

            this.initialized = true;
            logger.info('Uniswap DEX adapter initialized successfully');
            return true;
        } catch (error) {
            logger.error({ error }, 'Failed to initialize Uniswap DEX adapter');
            return false;
        }
    }

    getQuoterAddress(network) {
        // Uniswap V3 Quoter addresses for different networks
        const quoterAddresses = {
            ethereum: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
            arbitrum: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
            optimism: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
            polygon: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
        };

        return quoterAddresses[network] || quoterAddresses.ethereum;
    }

    async getPrice(network, baseToken, quoteToken, amount = '1') {
        try {
            if (!this.initialized) {
                throw new Error('Uniswap DEX adapter not initialized');
            }

            const baseTokenAddress = tokens.getTokenAddress(network, baseToken);
            const quoteTokenAddress = tokens.getTokenAddress(network, quoteToken);
            const baseDecimals = tokens.getTokenDecimals(baseToken);

            // Convert amount to wei format with correct decimals
            const amountIn = ethers.parseUnits(amount, baseDecimals);

            // Try different fee tiers to find the best price
            let bestAmountOut = ethers.BigNumber.from(0);

            for (const feeKey in POOL_FEES) {
                try {
                    const fee = POOL_FEES[feeKey];
                    const amountOut = await this.quoters[network].quoteExactInputSingle(
                        baseTokenAddress,
                        quoteTokenAddress,
                        fee,
                        amountIn,
                        0
                    );

                    if (amountOut.gt(bestAmountOut)) {
                        bestAmountOut = amountOut;
                    }
                } catch (e) {
                    // Pool might not exist for this fee tier, continue to next
                    continue;
                }
            }

            if (bestAmountOut.eq(0)) {
                throw new Error(`No valid pool found for ${baseToken}/${quoteToken} on ${network}`);
            }

            const quoteDecimals = tokens.getTokenDecimals(quoteToken);
            const price = ethers.formatUnits(bestAmountOut, quoteDecimals);

            // Save price in cache
            const pairKey = `${network}:${baseToken}-${quoteToken}`;
            this.prices[pairKey] = {
                price,
                timestamp: new Date().getTime()
            };

            return price;
        } catch (error) {
            logger.error({ error, baseToken, quoteToken, network }, 'Failed to get price from Uniswap');
            throw error;
        }
    }

    async executeTrade(network, action, baseToken, quoteToken, amount, slippagePercentage = 0.5) {
        try {
            if (!this.initialized) {
                throw new Error('Uniswap DEX adapter not initialized');
            }

            const baseTokenAddress = tokens.getTokenAddress(network, baseToken);
            const quoteTokenAddress = tokens.getTokenAddress(network, quoteToken);
            const baseDecimals = tokens.getTokenDecimals(baseToken);
            const quoteDecimals = tokens.getTokenDecimals(quoteToken);

            // Set deadline to 5 minutes from now
            const deadline = Math.floor(Date.now() / 1000) + 300;

            // Find the best pool by fee
            let bestFee = POOL_FEES.MEDIUM; // Default to medium fee
            let bestAmountOut = ethers.BigNumber.from(0);

            if (action === 'buy') {
                // If buying, we're swapping quote token for base token
                const amountIn = ethers.parseUnits(amount, quoteDecimals);

                for (const feeKey in POOL_FEES) {
                    try {
                        const fee = POOL_FEES[feeKey];
                        const amountOut = await this.quoters[network].quoteExactInputSingle(
                            quoteTokenAddress,
                            baseTokenAddress,
                            fee,
                            amountIn,
                            0
                        );

                        if (amountOut.gt(bestAmountOut)) {
                            bestAmountOut = amountOut;
                            bestFee = fee;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (bestAmountOut.eq(0)) {
                    throw new Error(`No valid pool found for ${baseToken}/${quoteToken} on ${network}`);
                }

                // Calculate minimum amount out with slippage
                const minAmountOut = bestAmountOut.mul(1000 - Math.floor(slippagePercentage * 10)).div(1000);

                // Approve token spending
                const tokenContract = new ethers.Contract(
                    quoteTokenAddress,
                    ERC20_ABI,
                    this.wallet.connect(config.networks[network].provider)
                );

                const approveTx = await tokenContract.approve(
                    config.dex.uniswapV3Router,
                    amountIn
                );
                await approveTx.wait();

                // Execute the swap
                const swapParams = {
                    tokenIn: quoteTokenAddress,
                    tokenOut: baseTokenAddress,
                    fee: bestFee,
                    recipient: this.wallet.address,
                    deadline,
                    amountIn,
                    amountOutMinimum: minAmountOut,
                    sqrtPriceLimitX96: 0
                };

                const tx = await this.routers[network].exactInputSingle(swapParams, {
                    gasLimit: config.trading.gasLimit,
                    gasPrice: await this.getGasPrice(network)
                });

                logger.info({ txHash: tx.hash, network, baseToken, quoteToken, amount }, 'Buy trade executed on Uniswap');

                return {
                    txHash: tx.hash,
                    amountIn: ethers.formatUnits(amountIn, quoteDecimals),
                    estimatedAmountOut: ethers.formatUnits(bestAmountOut, baseDecimals)
                };
            } else if (action === 'sell') {
                // If selling, we're swapping base token for quote token
                const amountIn = ethers.parseUnits(amount, baseDecimals);

                for (const feeKey in POOL_FEES) {
                    try {
                        const fee = POOL_FEES[feeKey];
                        const amountOut = await this.quoters[network].quoteExactInputSingle(
                            baseTokenAddress,
                            quoteTokenAddress,
                            fee,
                            amountIn,
                            0
                        );

                        if (amountOut.gt(bestAmountOut)) {
                            bestAmountOut = amountOut;
                            bestFee = fee;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (bestAmountOut.eq(0)) {
                    throw new Error(`No valid pool found for ${baseToken}/${quoteToken} on ${network}`);
                }

                // Calculate minimum amount out with slippage
                const minAmountOut = bestAmountOut.mul(1000 - Math.floor(slippagePercentage * 10)).div(1000);

                // Approve token spending
                const tokenContract = new ethers.Contract(
                    baseTokenAddress,
                    ERC20_ABI,
                    this.wallet.connect(config.networks[network].provider)
                );

                const approveTx = await tokenContract.approve(
                    config.dex.uniswapV3Router,
                    amountIn
                );
                await approveTx.wait();

                // Execute the swap
                const swapParams = {
                    tokenIn: baseTokenAddress,
                    tokenOut: quoteTokenAddress,
                    fee: bestFee,
                    recipient: this.wallet.address,
                    deadline,
                    amountIn,
                    amountOutMinimum: minAmountOut,
                    sqrtPriceLimitX96: 0
                };

                const tx = await this.routers[network].exactInputSingle(swapParams, {
                    gasLimit: config.trading.gasLimit,
                    gasPrice: await this.getGasPrice(network)
                });

                logger.info({ txHash: tx.hash, network, baseToken, quoteToken, amount }, 'Sell trade executed on Uniswap');

                return {
                    txHash: tx.hash,
                    amountIn: ethers.formatUnits(amountIn, baseDecimals),
                    estimatedAmountOut: ethers.formatUnits(bestAmountOut, quoteDecimals)
                };
            } else {
                throw new Error(`Invalid action: ${action}. Must be 'buy' or 'sell'`);
            }
        } catch (error) {
            logger.error({ error, network, action, baseToken, quoteToken, amount }, 'Failed to execute trade on Uniswap');
            throw error;
        }
    }

    async getGasPrice(network) {
        const provider = config.networks[network].provider;
        const gasPrice = await provider.getGasPrice();
        return gasPrice.mul(Math.floor(config.trading.gasPriceMultiplier * 100)).div(100);
    }

    async getTokenBalance(network, token) {
        try {
            const tokenAddress = tokens.getTokenAddress(network, token);
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ERC20_ABI,
                config.networks[network].provider
            );

            const balance = await tokenContract.balanceOf(this.wallet.address);
            const decimals = tokens.getTokenDecimals(token);

            return ethers.formatUnits(balance, decimals);
        } catch (error) {
            logger.error({ error, token, network }, 'Failed to get token balance');
            throw error;
        }
    }
}

module.exports = new UniswapDEX(); 