import { beforeAll, afterAll, afterEach } from 'vitest';
import nock from 'nock';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Clean nock after each test
afterEach(() => {
  nock.cleanAll();
});

// Prevent real HTTP calls
beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
});
