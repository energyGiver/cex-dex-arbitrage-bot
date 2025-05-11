const logger = require('../utils/logger');
const config = require('../config/config');
const binance = require('../exchange/binance');
const uniswap = require('../dex/uniswap');
const BigNumber = require('bignumber.js');
const NodeCache = require('node-cache');

// Set BigNumber configuration
BigNumber.config({ EXPONENTIAL_AT: 1e+9 });

class ArbitrageService {
    constructor() {
        this.opportunities = [];
        this.cache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
        this.running = false;
        this.initialized = false;

        // Set exchange fees (these can be configurable in .env)
        this.fees = {
            binance: {
                maker: 0.001, // 0.1%
                taker: 0.001, // 0.1%
            },
            uniswap: {
                fee: 0.003, // 0.3% (can vary by pool but this is a reasonable default)
            },
            gas: {
                // Estimated gas costs in USD for DEX trades by network
                ethereum: 20,
                arbitrum: 0.3,
                optimism: 0.1,
                polygon: 0.05,
            },
        };
    }

    async initialize() {
        try {
            logger.info('Initializing Arbitrage Service');

            // Initialize exchange adapters
            const binanceInitialized = await binance.initialize();
            const uniswapInitialized = await uniswap.initialize();

            if (!binanceInitialized || !uniswapInitialized) {
                throw new Error('Failed to initialize exchange adapters');
            }

            this.initialized = true;
            logger.info('Arbitrage Service initialized successfully');
            return true;
        } catch (error) {
            logger.error({ error }, 'Failed to initialize Arbitrage Service');
            return false;
        }
    }

    async start() {
        if (!this.initialized) {
            throw new Error('Arbitrage Service not initialized');
        }

        if (this.running) {
            logger.warn('Arbitrage Service already running');
            return;
        }

        this.running = true;
        logger.info('Starting Arbitrage Service');

        // Start the main arbitrage loop
        this.runArbitrageLoop();
    }

    async stop() {
        logger.info('Stopping Arbitrage Service');
        this.running = false;
    }

    async runArbitrageLoop() {
        while (this.running) {
            try {
                // Find arbitrage opportunities
                const opportunities = await this.findArbitrageOpportunities();

                // Execute profitable opportunities
                for (const opp of opportunities) {
                    if (opp.profitPercentage > config.trading.minimumProfitPercentage) {
                        await this.executeArbitrage(opp);
                    }
                }

                // Wait a short interval before the next iteration
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                logger.error({ error }, 'Error in arbitrage loop');
                // Wait a bit longer if there was an error
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    async findArbitrageOpportunities() {
        const opportunities = [];

        // Check all trading pairs
        for (const pair of config.trading.tradingPairs) {
            try {
                const [baseToken, quoteToken] = pair.split('-');
                const binanceSymbol = binance.getSymbolFromPair(pair);

                // Check for each network
                for (const network of Object.keys(config.networks)) {
                    if (!config.networks[network].provider) continue;

                    // Get prices from both exchanges
                    const cexBid = binance.getBestBid(binanceSymbol);
                    const cexAsk = binance.getBestAsk(binanceSymbol);

                    if (!cexBid || !cexAsk) {
                        logger.debug(`No Binance prices available for ${binanceSymbol}`);
                        continue;
                    }

                    // Check DEX price for the same pair
                    const dexPrice = await this.getDexPrice(network, baseToken, quoteToken);
                    if (!dexPrice) continue;

                    // Calculate potential arbitrage opportunities

                    // 1. Buy on DEX, sell on CEX
                    const dexToCexProfit = this.calculateProfit(
                        'dexToCex',
                        network,
                        baseToken,
                        quoteToken,
                        dexPrice,
                        cexBid
                    );

                    // 2. Buy on CEX, sell on DEX
                    const cexToDexProfit = this.calculateProfit(
                        'cexToDex',
                        network,
                        baseToken,
                        quoteToken,
                        cexAsk,
                        dexPrice
                    );

                    // Add profitable opportunities
                    if (dexToCexProfit.profitPercentage > 0) {
                        opportunities.push(dexToCexProfit);
                    }

                    if (cexToDexProfit.profitPercentage > 0) {
                        opportunities.push(cexToDexProfit);
                    }
                }
            } catch (error) {
                logger.error({ error, pair }, 'Error finding arbitrage opportunity for pair');
            }
        }

        // Sort by profit percentage (descending)
        opportunities.sort((a, b) => b.profitPercentage - a.profitPercentage);

        // Update the class property with current opportunities
        this.opportunities = opportunities;

        return opportunities;
    }

    async getDexPrice(network, baseToken, quoteToken) {
        try {
            // Check if we have a cached price that's recent
            const cacheKey = `dexPrice:${network}:${baseToken}-${quoteToken}`;
            const cachedPrice = this.cache.get(cacheKey);

            if (cachedPrice) {
                return cachedPrice;
            }

            // Get fresh price
            const price = await uniswap.getPrice(network, baseToken, quoteToken);

            // Cache the result
            this.cache.set(cacheKey, price);

            return price;
        } catch (error) {
            logger.error({ error, network, baseToken, quoteToken }, 'Failed to get DEX price');
            return null;
        }
    }

    calculateProfit(direction, network, baseToken, quoteToken, buyPrice, sellPrice) {
        // Convert strings to BigNumber to handle calculations precisely
        const buyPriceBN = new BigNumber(buyPrice);
        const sellPriceBN = new BigNumber(sellPrice);

        // Assume a standard trade amount (can be customized)
        const tradeAmount = new BigNumber('1'); // Trading 1 of the base token

        // Calculate costs and fees
        let binanceFee, dexFee, gasCost;
        if (direction === 'dexToCex') {
            // Buy on DEX, sell on CEX
            dexFee = tradeAmount.multipliedBy(this.fees.uniswap.fee);
            binanceFee = tradeAmount.multipliedBy(sellPriceBN).multipliedBy(this.fees.binance.taker);
            gasCost = new BigNumber(this.fees.gas[network] || 0.1);
        } else {
            // Buy on CEX, sell on DEX
            binanceFee = tradeAmount.multipliedBy(this.fees.binance.taker);
            dexFee = tradeAmount.multipliedBy(sellPriceBN).multipliedBy(this.fees.uniswap.fee);
            gasCost = new BigNumber(this.fees.gas[network] || 0.1);
        }

        // Calculate cost of buying
        const costToBuy = direction === 'dexToCex'
            ? tradeAmount.multipliedBy(buyPriceBN).plus(dexFee)
            : tradeAmount.multipliedBy(buyPriceBN).plus(binanceFee);

        // Calculate revenue from selling
        const revenueFromSell = direction === 'dexToCex'
            ? tradeAmount.multipliedBy(sellPriceBN).minus(binanceFee)
            : tradeAmount.multipliedBy(sellPriceBN).minus(dexFee);

        // Calculate profit and adjust for gas cost
        const profit = revenueFromSell.minus(costToBuy).minus(gasCost);

        // Calculate profit percentage
        const profitPercentage = profit.dividedBy(costToBuy).multipliedBy(100).toNumber();

        return {
            direction,
            network,
            baseToken,
            quoteToken,
            buyPrice: buyPriceBN.toString(),
            sellPrice: sellPriceBN.toString(),
            tradeAmount: tradeAmount.toString(),
            estimatedProfit: profit.toString(),
            profitPercentage,
            timestamp: new Date().getTime(),
        };
    }

    async executeArbitrage(opportunity) {
        try {
            logger.info({ opportunity }, 'Executing arbitrage opportunity');

            const { direction, network, baseToken, quoteToken, tradeAmount } = opportunity;
            const binanceSymbol = binance.getSymbolFromPair(`${baseToken}-${quoteToken}`);

            if (direction === 'dexToCex') {
                // Buy on DEX, sell on CEX

                // 1. Execute buy on DEX
                const buyResult = await uniswap.executeTrade(
                    network,
                    'buy',
                    baseToken,
                    quoteToken,
                    tradeAmount,
                    config.trading.maxSlippagePercentage
                );

                // 2. Wait for transaction to be mined
                logger.info({ txHash: buyResult.txHash }, 'DEX buy transaction submitted, waiting for confirmation');

                // 3. Sell on CEX
                const sellResult = await binance.executeSell(
                    binanceSymbol,
                    tradeAmount
                );

                logger.info({
                    direction,
                    network,
                    baseToken,
                    quoteToken,
                    dexTxHash: buyResult.txHash,
                    cexOrderId: sellResult.orderId,
                }, 'Arbitrage executed successfully: DEX to CEX');

            } else {
                // Buy on CEX, sell on DEX

                // 1. Execute buy on CEX
                const buyResult = await binance.executeBuy(
                    binanceSymbol,
                    binance.normalizeQuantity(binanceSymbol, tradeAmount)
                );

                // 2. Execute sell on DEX
                const sellResult = await uniswap.executeTrade(
                    network,
                    'sell',
                    baseToken,
                    quoteToken,
                    tradeAmount,
                    config.trading.maxSlippagePercentage
                );

                logger.info({
                    direction,
                    network,
                    baseToken,
                    quoteToken,
                    cexOrderId: buyResult.orderId,
                    dexTxHash: sellResult.txHash,
                }, 'Arbitrage executed successfully: CEX to DEX');
            }

            return true;
        } catch (error) {
            logger.error({ error, opportunity }, 'Failed to execute arbitrage');
            return false;
        }
    }

    getArbitrageOpportunities() {
        return this.opportunities;
    }
}

module.exports = new ArbitrageService(); 