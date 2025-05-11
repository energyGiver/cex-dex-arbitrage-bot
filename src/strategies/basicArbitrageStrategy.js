/**
 * Basic Arbitrage Strategy
 * 
 * Implements a simple arbitrage strategy that looks for direct price differences
 * between CEX and DEX for the same trading pair. Can be extended or replaced with 
 * more sophisticated strategies.
 */
const logger = require('../utils/logger');
const config = require('../config/config');
const BigNumber = require('bignumber.js');

class BasicArbitrageStrategy {
    constructor(options = {}) {
        this.minProfitPercentage = options.minProfitPercentage || config.trading.minimumProfitPercentage;
        this.maxSlippage = options.maxSlippage || config.trading.maxSlippagePercentage;
        this.networkPriority = options.networkPriority || ['arbitrum', 'optimism', 'polygon', 'ethereum'];

        // Exchange fee constants (can be override with options)
        this.cexFee = options.cexFee || 0.001; // 0.1% Binance fee
        this.dexFee = options.dexFee || 0.003; // 0.3% Uniswap fee (can vary by pool)

        // Gas costs in USD by network
        this.gasCosts = options.gasCosts || {
            ethereum: 20,   // Ethereum mainnet is expensive
            arbitrum: 0.3,  // L2s are cheaper
            optimism: 0.1,
            polygon: 0.05,
        };
    }

    /**
     * Evaluate prices between CEX and DEX to identify arbitrage opportunities
     * 
     * @param {Object} cexPrices - CEX price data { bid, ask }
     * @param {Object} dexPricesByNetwork - DEX price data by network { ethereum: price, arbitrum: price, ... }
     * @param {Object} params - Additional parameters { baseToken, quoteToken, ... }
     * @returns {Array} Sorted array of arbitrage opportunities
     */
    evaluateArbitrageOpportunities(cexPrices, dexPricesByNetwork, params = {}) {
        const { baseToken, quoteToken } = params;
        const opportunities = [];

        // Skip if either price source is missing
        if (!cexPrices || !dexPricesByNetwork) {
            return [];
        }

        // Calculate potential profits for each network
        for (const network of this.networkPriority) {
            const dexPrice = dexPricesByNetwork[network];

            // Skip if this network doesn't have a price
            if (!dexPrice) continue;

            // Calculate both directions (cex->dex and dex->cex)

            // 1. Buy from CEX, sell on DEX
            const cexToDexSpread = this.calculateSpread(
                new BigNumber(cexPrices.ask),
                new BigNumber(dexPrice),
                {
                    buyFee: this.cexFee,
                    sellFee: this.dexFee,
                    gasCost: this.gasCosts[network] || 0.1,
                    network,
                    baseToken,
                    quoteToken,
                    direction: 'cexToDex',
                }
            );

            // 2. Buy from DEX, sell on CEX
            const dexToCexSpread = this.calculateSpread(
                new BigNumber(dexPrice),
                new BigNumber(cexPrices.bid),
                {
                    buyFee: this.dexFee,
                    sellFee: this.cexFee,
                    gasCost: this.gasCosts[network] || 0.1,
                    network,
                    baseToken,
                    quoteToken,
                    direction: 'dexToCex',
                }
            );

            // Add profitable opportunities to the list
            if (cexToDexSpread.profitPercentage > this.minProfitPercentage) {
                opportunities.push(cexToDexSpread);
            }

            if (dexToCexSpread.profitPercentage > this.minProfitPercentage) {
                opportunities.push(dexToCexSpread);
            }
        }

        // Sort by profitability (descending)
        return opportunities.sort((a, b) => b.profitPercentage - a.profitPercentage);
    }

    /**
     * Calculate spread and potential profit between buy and sell prices
     * 
     * @param {BigNumber} buyPrice - Price to buy at
     * @param {BigNumber} sellPrice - Price to sell at 
     * @param {Object} options - Additional options for calculation
     * @returns {Object} Opportunity details with profit calculation
     */
    calculateSpread(buyPrice, sellPrice, options = {}) {
        const {
            buyFee = 0.001,
            sellFee = 0.001,
            gasCost = 0.1,
            baseToken = 'ETH',
            quoteToken = 'USDT',
            network = 'ethereum',
            direction = 'cexToDex',
            tradeSize = 1,
        } = options;

        // Convert to BigNumber if needed
        const tradeSizeBN = new BigNumber(tradeSize);

        // Calculate cost to buy (including fee)
        const buyAmount = tradeSizeBN;
        const buyCost = buyPrice.multipliedBy(buyAmount);
        const buyFeeAmount = buyCost.multipliedBy(buyFee);
        const totalBuyCost = buyCost.plus(buyFeeAmount);

        // Calculate sell proceeds (after fee)
        const sellProceeds = sellPrice.multipliedBy(buyAmount);
        const sellFeeAmount = sellProceeds.multipliedBy(sellFee);
        const totalSellProceeds = sellProceeds.minus(sellFeeAmount);

        // Calculate gas cost in terms of the quote token
        const gasCostBN = new BigNumber(gasCost);

        // Calculate raw profit and profit percentage
        const rawProfit = totalSellProceeds.minus(totalBuyCost);
        const profitAfterGas = rawProfit.minus(gasCostBN);
        const profitPercentage = profitAfterGas.dividedBy(totalBuyCost).multipliedBy(100).toNumber();

        return {
            direction,
            network,
            baseToken,
            quoteToken,
            buyPrice: buyPrice.toString(),
            sellPrice: sellPrice.toString(),
            buyFee: buyFee.toString(),
            sellFee: sellFee.toString(),
            tradeSize: tradeSizeBN.toString(),
            totalBuyCost: totalBuyCost.toString(),
            totalSellProceeds: totalSellProceeds.toString(),
            gasCost: gasCostBN.toString(),
            rawProfit: rawProfit.toString(),
            profitAfterGas: profitAfterGas.toString(),
            profitPercentage,
            timestamp: Date.now(),
        };
    }

    /**
     * Determine if an opportunity should be executed based on strategy criteria
     * 
     * @param {Object} opportunity - The arbitrage opportunity
     * @returns {Boolean} Whether the opportunity should be executed
     */
    shouldExecute(opportunity) {
        // Basic checks for profitability
        if (!opportunity || opportunity.profitPercentage < this.minProfitPercentage) {
            return false;
        }

        // Check if gas costs are reasonable compared to profit
        const profitAfterGas = new BigNumber(opportunity.profitAfterGas);
        const gasCost = new BigNumber(opportunity.gasCost);

        // Make sure gas isn't eating up too much of the profit
        // Here we require profit to be at least 3x the gas cost
        if (profitAfterGas.isLessThan(gasCost.multipliedBy(3))) {
            logger.debug({
                opportunity: {
                    direction: opportunity.direction,
                    profitPercentage: opportunity.profitPercentage,
                    profitAfterGas: profitAfterGas.toString(),
                    gasCost: gasCost.toString()
                }
            }, 'Opportunity rejected: profit too small relative to gas cost');
            return false;
        }

        return true;
    }
}

module.exports = BasicArbitrageStrategy; 