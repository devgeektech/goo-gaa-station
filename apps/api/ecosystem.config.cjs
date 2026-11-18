const path = require('path');

/** apps/api — use this file's directory as cwd (uploads, logs, env). */
const apiRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'goo-gaa-api',
      cwd: apiRoot,
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      time: true,
      error_file: path.join(apiRoot, 'logs', 'pm2-error.log'),
      out_file: path.join(apiRoot, 'logs', 'pm2-out.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};