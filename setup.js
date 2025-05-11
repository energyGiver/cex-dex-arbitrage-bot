#!/usr/bin/env node
/**
 * Setup script for CEX-DEX Arbitrage Bot
 * This scripts helps with initial setup by creating a .env file from .env.example
 */
const fs = require('fs');
const path = require('path');

console.log('Setting up CEX-DEX Arbitrage Bot...');

const envExamplePath = path.join(__dirname, '.env.example');
const envPath = path.join(__dirname, '.env');

// Check if .env.example exists
if (!fs.existsSync(envExamplePath)) {
    console.error('Error: .env.example file not found.');
    process.exit(1);
}

// Check if .env already exists
if (fs.existsSync(envPath)) {
    console.log('.env file already exists. Skipping creation.');
} else {
    // Copy .env.example to .env
    fs.copyFileSync(envExamplePath, envPath);
    console.log('.env file created from .env.example');
}

console.log('\nSetup complete! Please edit the .env file with your own values:');
console.log(`- API keys for Binance`);
console.log(`- RPC URLs for Ethereum networks`);
console.log(`- Private key for DEX trading`);
console.log(`- Configuration parameters\n`);

console.log('After configuring .env, you can start the bot with:');
console.log('npm start');

// Make the script executable
try {
    fs.chmodSync(__filename, '755');
} catch (e) {
    // Ignore permission errors
}

// Check for dependencies
try {
    const packageJson = require('./package.json');
    const dependencies = Object.keys(packageJson.dependencies || {});

    console.log('\nRequired dependencies:');
    dependencies.forEach(dep => console.log(`- ${dep}`));

    console.log('\nTo install dependencies, run:');
    console.log('npm install');
} catch (e) {
    console.error('Error reading package.json:', e.message);
} 