const path = require('path');

const adminRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'goo-gaa-admin',
      cwd: adminRoot,
      script: path.join(adminRoot, 'node_modules', '.bin', 'next'),
      args: 'start -p 3002',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      time: true,
      error_file: path.join(adminRoot, 'logs', 'pm2-error.log'),
      out_file: path.join(adminRoot, 'logs', 'pm2-out.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
      },
    },
  ],
};