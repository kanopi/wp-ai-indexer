#!/usr/bin/env node

/**
 * CLI entry point for wp-ai-indexer
 */

// Check if built files exist
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'cli.js');

if (!fs.existsSync(distPath)) {
  console.error('❌ Error: Built files not found. Please run "npm run build" first.');
  console.error('   Expected file:', distPath);
  process.exit(1);
}

// Run the CLI
const { CLI } = require('../dist/cli');
const cli = new CLI();
cli.run(process.argv).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
