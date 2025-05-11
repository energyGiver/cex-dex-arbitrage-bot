const express = require('express');
const logger = require('../utils/logger');
const config = require('../config/config');
const arbitrageService = require('./arbitrageService');
const binance = require('../exchange/binance');
const uniswap = require('../dex/uniswap');

class ApiService {
    constructor() {
        this.app = express();
        this.initialized = false;
    }

    async initialize() {
        try {
            logger.info('Initializing API Service');

            // Configure Express
            this.configureExpress();

            // Define routes
            this.defineRoutes();

            this.initialized = true;
            logger.info('API Service initialized successfully');
            return true;
        } catch (error) {
            logger.error({ error }, 'Failed to initialize API Service');
            return false;
        }
    }

    configureExpress() {
        // Middleware to parse JSON
        this.app.use(express.json());

        // Add logging middleware
        this.app.use((req, res, next) => {
            logger.info({ path: req.path, method: req.method, ip: req.ip }, 'API request');
            next();
        });
    }

    defineRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Get all current arbitrage opportunities
        this.app.get('/api/opportunities', (req, res) => {
            const opportunities = arbitrageService.getArbitrageOpportunities();
            res.json({ opportunities });
        });

        // Get trading pairs being monitored
        this.app.get('/api/pairs', (req, res) => {
            res.json({ pairs: config.trading.tradingPairs });
        });

        // Get CEX prices
        this.app.get('/api/prices/cex/:symbol', (req, res) => {
            const { symbol } = req.params;
            const price = {
                bid: binance.getBestBid(symbol),
                ask: binance.getBestAsk(symbol),
                timestamp: new Date().toISOString()
            };

            if (!price.bid || !price.ask) {
                return res.status(404).json({ error: `No price found for symbol ${symbol}` });
            }

            res.json({ symbol, price });
        });

        // Get DEX prices
        this.app.get('/api/prices/dex/:network/:baseToken/:quoteToken', async (req, res) => {
            const { network, baseToken, quoteToken } = req.params;

            try {
                const price = await arbitrageService.getDexPrice(network, baseToken, quoteToken);

                if (!price) {
                    return res.status(404).json({ error: `No price found for ${baseToken}/${quoteToken} on ${network}` });
                }

                res.json({
                    network,
                    pair: `${baseToken}-${quoteToken}`,
                    price,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error({ error, network, baseToken, quoteToken }, 'Error getting DEX price');
                res.status(500).json({ error: error.message });
            }
        });

        // Get arbitrage service status
        this.app.get('/api/status', (req, res) => {
            res.json({
                running: arbitrageService.running,
                initialized: arbitrageService.initialized,
                opportunities: arbitrageService.opportunities.length,
                timestamp: new Date().toISOString()
            });
        });

        // Manually trigger arbitrage opportunity search
        this.app.post('/api/opportunities/find', async (req, res) => {
            try {
                const opportunities = await arbitrageService.findArbitrageOpportunities();
                res.json({ success: true, opportunities });
            } catch (error) {
                logger.error({ error }, 'Error finding arbitrage opportunities');
                res.status(500).json({ error: error.message });
            }
        });

        // Manually execute an arbitrage opportunity
        this.app.post('/api/opportunities/execute', async (req, res) => {
            const { opportunityId } = req.body;

            if (!opportunityId) {
                return res.status(400).json({ error: 'opportunityId is required' });
            }

            const opportunities = arbitrageService.getArbitrageOpportunities();
            const opportunity = opportunities.find(o => o.timestamp === parseInt(opportunityId));

            if (!opportunity) {
                return res.status(404).json({ error: `Opportunity with ID ${opportunityId} not found` });
            }

            try {
                const result = await arbitrageService.executeArbitrage(opportunity);
                res.json({ success: result, opportunity });
            } catch (error) {
                logger.error({ error, opportunityId }, 'Error executing arbitrage opportunity');
                res.status(500).json({ error: error.message });
            }
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            logger.error({ error: err }, 'API error');
            res.status(500).json({ error: err.message });
        });
    }

    async start() {
        if (!this.initialized) {
            throw new Error('API Service not initialized');
        }

        const port = config.server.port;

        this.server = this.app.listen(port, () => {
            logger.info({ port }, 'API Service started');
        });
    }

    async stop() {
        if (this.server) {
            this.server.close();
            logger.info('API Service stopped');
        }
    }
}

module.exports = new ApiService(); 