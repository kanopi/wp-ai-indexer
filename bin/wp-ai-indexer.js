#!/usr/bin/env node

/**
 * CLI entry point for wp-ai-indexer
 */

// Try to load the CLI module
// This works regardless of how the script is executed (direct, npx, or symlink)
try {
  const { CLI } = require('../dist/cli');
  const cli = new CLI();
  cli.run(process.argv).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
} catch (error) {
  // If module not found, show helpful error
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('❌ Error: Built files not found. Please run "npm run build" first.');
    console.error('   Module:', error.message);
  } else {
    console.error('❌ Error loading CLI:', error.message);
  }
  process.exit(1);
}
