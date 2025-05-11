const Binance = require('binance-api-node').default;
const logger = require('../utils/logger');
const config = require('../config/config');
const BigNumber = require('bignumber.js');

class BinanceExchange {
    constructor() {
        this.client = Binance({
            apiKey: config.binance.apiKey,
            apiSecret: config.binance.apiSecret,
        });
        this.prices = {};
        this.orderBooks = {};
        this.exchangeInfo = null;
        this.symbolInfo = {};
    }

    async initialize() {
        try {
            logger.info('Initializing Binance exchange');
            this.exchangeInfo = await this.client.exchangeInfo();

            // Extract symbol info for our trading pairs
            for (const symbol of this.exchangeInfo.symbols) {
                this.symbolInfo[symbol.symbol] = {
                    baseAsset: symbol.baseAsset,
                    quoteAsset: symbol.quoteAsset,
                    filters: symbol.filters,
                    stepSize: symbol.filters.find(f => f.filterType === 'LOT_SIZE')?.stepSize || '0.00000001',
                    tickSize: symbol.filters.find(f => f.filterType === 'PRICE_FILTER')?.tickSize || '0.00000001',
                    minNotional: symbol.filters.find(f => f.filterType === 'MIN_NOTIONAL')?.minNotional || '10',
                };
            }

            // Start websocket for price updates for our trading pairs
            this.startPriceStream();

            logger.info('Binance exchange initialized successfully');
            return true;
        } catch (error) {
            logger.error({ error }, 'Failed to initialize Binance exchange');
            return false;
        }
    }

    startPriceStream() {
        // Get the list of symbols we want to track from config
        const symbols = config.trading.tradingPairs.map(pair => {
            const [base, quote] = pair.split('-');
            return `${base}${quote}`.toUpperCase();
        });

        // Connect to ticker streams for all symbols
        this.client.ws.ticker(symbols, ticker => {
            this.prices[ticker.symbol] = {
                bid: ticker.bestBid,
                ask: ticker.bestAsk,
                last: ticker.lastPrice,
                timestamp: new Date().getTime(),
            };
        });

        logger.info({ symbols }, 'Started Binance price streams');
    }

    async getOrderBook(symbol, limit = 5) {
        try {
            const orderBook = await this.client.book({ symbol, limit });
            this.orderBooks[symbol] = {
                bids: orderBook.bids,
                asks: orderBook.asks,
                timestamp: new Date().getTime(),
            };
            return this.orderBooks[symbol];
        } catch (error) {
            logger.error({ error, symbol }, 'Failed to fetch order book');
            return null;
        }
    }

    getBestAsk(symbol) {
        if (!this.prices[symbol]) {
            return null;
        }
        return this.prices[symbol].ask;
    }

    getBestBid(symbol) {
        if (!this.prices[symbol]) {
            return null;
        }
        return this.prices[symbol].bid;
    }

    getSymbolFromPair(pair) {
        const [base, quote] = pair.split('-');
        return `${base}${quote}`.toUpperCase();
    }

    async executeBuy(symbol, quantity) {
        try {
            const order = await this.client.order({
                symbol,
                side: 'BUY',
                type: 'MARKET',
                quantity,
            });

            logger.info({ orderId: order.orderId, symbol, quantity }, 'Buy order executed on Binance');
            return order;
        } catch (error) {
            logger.error({ error, symbol, quantity }, 'Failed to execute buy order on Binance');
            throw error;
        }
    }

    async executeSell(symbol, quantity) {
        try {
            const order = await this.client.order({
                symbol,
                side: 'SELL',
                type: 'MARKET',
                quantity,
            });

            logger.info({ orderId: order.orderId, symbol, quantity }, 'Sell order executed on Binance');
            return order;
        } catch (error) {
            logger.error({ error, symbol, quantity }, 'Failed to execute sell order on Binance');
            throw error;
        }
    }

    normalizeQuantity(symbol, quantity) {
        const info = this.symbolInfo[symbol];
        if (!info) {
            throw new Error(`Symbol info not found for ${symbol}`);
        }

        const stepSize = new BigNumber(info.stepSize);
        const normalized = new BigNumber(quantity)
            .dividedToIntegerBy(stepSize)
            .multipliedBy(stepSize)
            .toString();

        return normalized;
    }

    async getBalance(asset) {
        try {
            const accountInfo = await this.client.accountInfo();
            const balance = accountInfo.balances.find(b => b.asset === asset);
            return balance ?
                { free: balance.free, locked: balance.locked } :
                { free: '0', locked: '0' };
        } catch (error) {
            logger.error({ error, asset }, 'Failed to fetch balance');
            throw error;
        }
    }
}

module.exports = new BinanceExchange(); 