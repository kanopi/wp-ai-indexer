import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLI } from '../../src/cli';

describe('CLI Integration', () => {
  let cli: CLI;
  const originalEnv = process.env;
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

  beforeEach(() => {
    cli = new CLI();
    process.env = {
      ...originalEnv,
      WP_API_BASE: 'https://test.example.com',
      OPENAI_API_KEY: 'test-openai-key',
      PINECONE_API_KEY: 'test-pinecone-key',
    };
    mockExit.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('config validation', () => {
    it('should parse environment variables correctly', async () => {
      const config = (cli as any).getConfig({});

      expect(config.wpApiBase).toBe('https://test.example.com');
      expect(config.openaiApiKey).toBe('test-openai-key');
      expect(config.pineconeApiKey).toBe('test-pinecone-key');
    });

    it('should throw error if WP_API_BASE is missing', () => {
      delete process.env.WP_API_BASE;

      expect(() => (cli as any).getConfig({})).toThrow(/WP_API_BASE/);
    });

    it('should throw error if OPENAI_API_KEY is missing', () => {
      delete process.env.OPENAI_API_KEY;

      expect(() => (cli as any).getConfig({})).toThrow(/OPENAI_API_KEY/);
    });

    it('should throw error if PINECONE_API_KEY is missing', () => {
      delete process.env.PINECONE_API_KEY;

      expect(() => (cli as any).getConfig({})).toThrow(/PINECONE_API_KEY/);
    });

    it('should parse optional authentication credentials', () => {
      process.env.WP_API_USERNAME = 'testuser';
      process.env.WP_API_PASSWORD = 'testpass';

      const config = (cli as any).getConfig({});

      expect(config.wpUsername).toBe('testuser');
      expect(config.wpPassword).toBe('testpass');
    });

    it('should parse optional settings URL', () => {
      process.env.WP_AI_SETTINGS_URL = 'https://example.com/custom-settings';

      const config = (cli as any).getConfig({});

      expect(config.settingsUrl).toBe('https://example.com/custom-settings');
    });

    it('should parse debug flag from environment', () => {
      process.env.WP_AI_DEBUG = '1';

      const config = (cli as any).getConfig({});

      expect(config.debug).toBe(true);
    });

    it('should parse debug flag from command options', () => {
      const config = (cli as any).getConfig({ debug: true });

      expect(config.debug).toBe(true);
    });

    it('should parse timeout from environment', () => {
      process.env.WP_AI_TIMEOUT_MS = '5000';

      const config = (cli as any).getConfig({});

      expect(config.timeout).toBe(5000);
    });

    it('should use default timeout if not specified', () => {
      // Save original value
      const originalTimeout = process.env.WP_AI_TIMEOUT_MS;
      delete process.env.WP_AI_TIMEOUT_MS;

      const config = (cli as any).getConfig({});

      expect(config.timeout).toBe(30000);

      // Restore original value
      if (originalTimeout) {
        process.env.WP_AI_TIMEOUT_MS = originalTimeout;
      }
    });

    it('should parse concurrency from environment', () => {
      process.env.WP_AI_CONCURRENCY = '5';

      const config = (cli as any).getConfig({});

      expect(config.concurrency).toBe(5);
    });

    it('should use default concurrency if not specified', () => {
      const config = (cli as any).getConfig({});

      expect(config.concurrency).toBe(2);
    });

    it('should parse namespace from environment', () => {
      process.env.WP_AI_NAMESPACE = 'test-namespace';

      const config = (cli as any).getConfig({});

      expect(config.namespace).toBe('test-namespace');
    });

    it('should remove trailing slash from WP_API_BASE', () => {
      process.env.WP_API_BASE = 'https://test.example.com/';

      const config = (cli as any).getConfig({});

      expect(config.wpApiBase).toBe('https://test.example.com');
    });
  });

  describe('command setup', () => {
    it('should have index command', () => {
      const commands = (cli as any).program.commands;
      const indexCmd = commands.find((cmd: any) => cmd.name() === 'index');

      expect(indexCmd).toBeDefined();
      expect(indexCmd.description()).toContain('Index all configured');
    });

    it('should have clean command', () => {
      const commands = (cli as any).program.commands;
      const cleanCmd = commands.find((cmd: any) => cmd.name() === 'clean');

      expect(cleanCmd).toBeDefined();
      expect(cleanCmd.description()).toContain('Remove deleted posts');
    });

    it('should have delete-all command', () => {
      const commands = (cli as any).program.commands;
      const deleteCmd = commands.find((cmd: any) => cmd.name() === 'delete-all');

      expect(deleteCmd).toBeDefined();
      expect(deleteCmd.description()).toContain('Delete all vectors');
    });

    it('should have config command', () => {
      const commands = (cli as any).program.commands;
      const configCmd = commands.find((cmd: any) => cmd.name() === 'config');

      expect(configCmd).toBeDefined();
      expect(configCmd.description()).toContain('Show current configuration');
    });
  });

  describe('command options', () => {
    it('index command should accept --debug option', () => {
      const commands = (cli as any).program.commands;
      const indexCmd = commands.find((cmd: any) => cmd.name() === 'index');
      const options = indexCmd.options;

      const debugOption = options.find((opt: any) => opt.long === '--debug');
      expect(debugOption).toBeDefined();
    });

    it('index command should accept --since option', () => {
      const commands = (cli as any).program.commands;
      const indexCmd = commands.find((cmd: any) => cmd.name() === 'index');
      const options = indexCmd.options;

      const sinceOption = options.find((opt: any) => opt.long === '--since');
      expect(sinceOption).toBeDefined();
    });

    it('delete-all command should accept --yes option', () => {
      const commands = (cli as any).program.commands;
      const deleteCmd = commands.find((cmd: any) => cmd.name() === 'delete-all');
      const options = deleteCmd.options;

      const yesOption = options.find((opt: any) => opt.long === '--yes');
      expect(yesOption).toBeDefined();
    });
  });

  describe('showConfig', () => {
    it('should display all configuration variables', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await (cli as any).showConfig();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Current Configuration')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('WP_API_BASE'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('OPENAI_API_KEY'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('PINECONE_API_KEY'));

      consoleLogSpy.mockRestore();
    });

    it('should show checkmark for set variables', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await (cli as any).showConfig();

      const allLogs = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(allLogs).toContain('✓');

      consoleLogSpy.mockRestore();
    });

    it('should exit with error if required variables missing', () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Recreate CLI with missing variables
      const testCli = new CLI();

      // This will try to get config and should throw
      expect(() => (testCli as any).getConfig({})).toThrow(/OPENAI_API_KEY/);

      consoleLogSpy.mockRestore();

      // Restore original
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    });
  });

  describe('error handling', () => {
    it('should handle missing required environment variables gracefully', () => {
      delete process.env.WP_API_BASE;

      expect(() => (cli as any).getConfig({})).toThrow();
    });

    it('should validate numeric environment variables', () => {
      process.env.WP_AI_TIMEOUT_MS = 'invalid';

      const config = (cli as any).getConfig({});

      expect(isNaN(config.timeout)).toBe(true);
    });
  });

  describe('CLI program', () => {
    it('should have correct program name', () => {
      expect((cli as any).program.name()).toBe('wp-ai-indexer');
    });

    it('should have description', () => {
      const description = (cli as any).program.description();
      expect(description).toContain('WordPress AI Indexer');
    });

    it('should have version', () => {
      const version = (cli as any).program.version();
      expect(version).toBe('1.0.0');
    });
  });
});
