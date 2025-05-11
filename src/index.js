/**
 * CEX/DEX Arbitrage Bot
 * Monitors prices between centralized exchanges (Binance) and
 * decentralized exchanges (Uniswap) to find and execute arbitrage opportunities.
 */
const logger = require('./utils/logger');
const arbitrageService = require('./services/arbitrageService');
const apiService = require('./services/apiService');

// Handle process termination signals
process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal. Shutting down...');
    await shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal. Shutting down...');
    await shutdown();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    shutdown().then(() => process.exit(1));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    shutdown().then(() => process.exit(1));
});

// Function to gracefully shut down the application
async function shutdown() {
    logger.info('Shutting down services...');
    await arbitrageService.stop();
    await apiService.stop();
    logger.info('All services stopped. Goodbye!');
}

// Main function to start the application
async function main() {
    try {
        logger.info('Starting CEX/DEX Arbitrage Bot');

        // Initialize services
        const arbitrageInitialized = await arbitrageService.initialize();
        const apiInitialized = await apiService.initialize();

        if (!arbitrageInitialized || !apiInitialized) {
            throw new Error('Failed to initialize one or more services');
        }

        // Start services
        await arbitrageService.start();
        await apiService.start();

        logger.info('All services started successfully. Bot is running.');

    } catch (error) {
        logger.error({ error }, 'Failed to start the application');
        process.exit(1);
    }
}

// Execute the main function
main();
