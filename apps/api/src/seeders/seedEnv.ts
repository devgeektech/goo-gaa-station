import fs from 'fs';
import path from 'path';
import { config as dotenvConfig } from 'dotenv';

const apiRoot = path.resolve(__dirname, '../..');

function loadEnvFile(relativePath: string, override: boolean): void {
  const full = path.join(apiRoot, relativePath);
  if (fs.existsSync(full)) {
    dotenvConfig({ path: full, override });
  }
}

/**
 * Load MongoDB (and related) vars from apps/api `.env` files without dotenv-safe.
 * Import this module first in seed scripts (before `../config/env`).
 */
export function loadSeedEnv(): void {
  if (process.env.__SEED_ENV_LOADED__ === '1') return;

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv) {
    loadEnvFile(`.env.${nodeEnv}`, false);
  }
  loadEnvFile('.env.production', false);
  loadEnvFile('.env.development', false);
  loadEnvFile('.env', true);

  process.env.__SEED_ENV_LOADED__ = '1';
}

loadSeedEnv();