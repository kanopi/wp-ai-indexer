/**
 * CLI Interface
 * Command-line interface for the indexer
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { Indexer } from './indexer';
import { IndexerConfig } from './types';

// Load environment variables
dotenv.config();

export class CLI {
  private program: Command;

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  /**
   * Setup CLI commands
   */
  private setupCommands(): void {
    this.program
      .name('wp-ai-indexer')
      .description('WordPress AI Indexer - Shared indexer for AI Chatbot & Search plugins')
      .version('1.0.0');

    // Index command
    this.program
      .command('index')
      .description('Index all configured WordPress content')
      .option('--since <date>', 'Index only posts modified since this date (ISO format)')
      .option('--debug', 'Enable debug logging')
      .action(async (options) => {
        await this.runIndex(options);
      });

    // Clean command
    this.program
      .command('clean')
      .description('Remove deleted posts from the index')
      .option('--debug', 'Enable debug logging')
      .action(async (options) => {
        await this.runClean(options);
      });

    // Delete all command
    this.program
      .command('delete-all')
      .description('Delete all vectors for the current domain (requires confirmation)')
      .option('--yes', 'Skip confirmation prompt')
      .option('--debug', 'Enable debug logging')
      .action(async (options) => {
        await this.runDeleteAll(options);
      });

    // Config command (show current config)
    this.program
      .command('config')
      .description('Show current configuration')
      .action(async () => {
        await this.showConfig();
      });
  }

  /**
   * Run the index command
   */
  private async runIndex(options: any): Promise<void> {
    try {
      const config = this.getConfig(options);

      console.log('Configuration:');
      console.log(`  WP API Base: ${config.wpApiBase}`);
      console.log(`  Settings URL: ${config.settingsUrl || 'auto'}`);
      console.log(`  Debug: ${config.debug ? 'enabled' : 'disabled'}`);
      if (options.since) {
        console.log(`  Since: ${options.since}`);
      }

      const indexer = new Indexer(config);
      const result = await indexer.index();

      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
    } catch (error: any) {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Run the clean command
   */
  private async runClean(options: any): Promise<void> {
    try {
      const config = this.getConfig(options);
      const indexer = new Indexer(config);
      await indexer.clean();

      process.exit(0);
    } catch (error: any) {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Run the delete-all command
   */
  private async runDeleteAll(options: any): Promise<void> {
    try {
      const config = this.getConfig(options);

      // Get domain from config
      const SettingsManager = require('./settings').SettingsManager;
      const settingsManager = new SettingsManager(config);
      const settings = await settingsManager.fetchSettings();

      // Show warning and get confirmation
      if (!options.yes) {
        console.log('\n⚠️  WARNING: This will delete ALL vectors for the current domain!\n');
        console.log(`Domain: ${settings.domain}`);
        console.log(`\nThis action cannot be undone.\n`);

        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question('Type "DELETE" to confirm: ', resolve);
        });

        rl.close();

        if (answer.trim() !== 'DELETE') {
          console.log('\n❌ Aborted. No vectors were deleted.\n');
          process.exit(0);
        }
      }

      const indexer = new Indexer(config);
      await indexer.deleteAll();

      process.exit(0);
    } catch (error: any) {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Show current configuration
   */
  private async showConfig(): Promise<void> {
    console.log('\n📋 Current Configuration\n');

    const config = this.getConfig({});

    console.log('Environment Variables:');
    console.log(`  WP_API_BASE: ${config.wpApiBase || '(not set)'}`);
    console.log(`  WP_API_USERNAME: ${config.wpUsername ? '✓ set' : '✗ not set'}`);
    console.log(`  WP_API_PASSWORD: ${config.wpPassword ? '✓ set' : '✗ not set'}`);
    console.log(`  WP_AI_SETTINGS_URL: ${config.settingsUrl || '(not set)'}`);
    console.log(`  OPENAI_API_KEY: ${config.openaiApiKey ? '✓ set' : '✗ not set'}`);
    console.log(`  PINECONE_API_KEY: ${config.pineconeApiKey ? '✓ set' : '✗ not set'}`);
    console.log(`  WP_AI_DEBUG: ${config.debug ? 'enabled' : 'disabled'}`);
    console.log(`  WP_AI_TIMEOUT_MS: ${config.timeout || 30000}ms`);
    console.log(`  WP_AI_CONCURRENCY: ${config.concurrency || 2}`);
    console.log(`  WP_AI_NAMESPACE: ${config.namespace || '(default)'}`);

    console.log('\nRequired:');
    const required = [
      { name: 'WP_API_BASE', set: !!config.wpApiBase },
      { name: 'OPENAI_API_KEY', set: !!config.openaiApiKey },
      { name: 'PINECONE_API_KEY', set: !!config.pineconeApiKey },
    ];

    console.log('\nOptional (for authentication):');
    console.log(`  ${config.wpUsername ? '✓' : '○'} WP_API_USERNAME`);
    console.log(`  ${config.wpPassword ? '✓' : '○'} WP_API_PASSWORD`);

    let allSet = true;
    for (const req of required) {
      const status = req.set ? '✓' : '✗';
      console.log(`  ${status} ${req.name}`);
      if (!req.set) allSet = false;
    }

    if (!allSet) {
      console.log('\n⚠️  Some required environment variables are not set!');
      console.log('\nExample .env file:');
      console.log('WP_API_BASE=https://example.com');
      console.log('WP_API_USERNAME=username  # optional, for auth');
      console.log('WP_API_PASSWORD=password  # optional, for auth');
      console.log('OPENAI_API_KEY=sk-...');
      console.log('PINECONE_API_KEY=...');
      console.log('WP_AI_DEBUG=1  # optional');
      process.exit(1);
    }

    console.log('\n✅ Configuration is valid!\n');
  }

  /**
   * Get configuration from environment
   */
  private getConfig(options: any): IndexerConfig {
    const wpApiBase = process.env.WP_API_BASE;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const pineconeApiKey = process.env.PINECONE_API_KEY;

    if (!wpApiBase) {
      throw new Error('WP_API_BASE environment variable is required');
    }

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    if (!pineconeApiKey) {
      throw new Error('PINECONE_API_KEY environment variable is required');
    }

    const config: IndexerConfig = {
      wpApiBase: wpApiBase.replace(/\/$/, ''), // Remove trailing slash
      openaiApiKey,
      pineconeApiKey,
      wpUsername: process.env.WP_API_USERNAME,
      wpPassword: process.env.WP_API_PASSWORD,
      settingsUrl: process.env.WP_AI_SETTINGS_URL,
      debug: options.debug || process.env.WP_AI_DEBUG === '1',
      timeout: parseInt(process.env.WP_AI_TIMEOUT_MS || '30000', 10),
      concurrency: parseInt(process.env.WP_AI_CONCURRENCY || '2', 10),
      namespace: process.env.WP_AI_NAMESPACE,
    };

    return config;
  }

  /**
   * Run the CLI
   */
  async run(args: string[]): Promise<void> {
    await this.program.parseAsync(args);
  }
}

// Run CLI if this is the main module
if (require.main === module) {
  const cli = new CLI();
  cli.run(process.argv).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
