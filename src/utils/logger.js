const pino = require('pino');
const config = require('../config/config');

const logger = pino({
    level: config.server.logLevel,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
        },
    },
});

module.exports = logger; 