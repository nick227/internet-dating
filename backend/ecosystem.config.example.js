/**
 * PM2 Ecosystem Configuration
 * 
 * Usage:
 *   1. Copy this file: cp ecosystem.config.example.js ecosystem.config.js
 *   2. Update environment variables as needed
 *   3. Start all processes: pm2 start ecosystem.config.js
 *   4. Save configuration: pm2 save
 *   5. Enable auto-restart on boot: pm2 startup
 * 
 * Management:
 *   pm2 status              - View all processes
 *   pm2 logs               - View all logs
 *   pm2 logs schedule-daemon - View daemon logs only
 *   pm2 restart all        - Restart all processes
 *   pm2 stop all           - Stop all processes
 */

module.exports = {
  apps: [
    {
      name: 'web-server',
      script: 'dist/index.js',
      cwd: './backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        SCHEDULE_DAEMON_ENABLED: 'false', // Don't run daemon on web process
        DATABASE_URL: 'mysql://user:password@localhost:3306/internet_date',
        JWT_SECRET: 'your-secret-key-here'
      }
    },
    {
      name: 'job-worker',
      script: 'dist/workers/jobWorker.js',
      cwd: './backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://user:password@localhost:3306/internet_date'
      }
    },
    {
      name: 'schedule-daemon',
      script: 'scripts/scheduleDaemon.ts',
      cwd: './backend',
      interpreter: 'node',
      interpreter_args: '--loader tsx/esm',
      instances: 1, // ❗ MUST be 1 (only one daemon should run)
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000, // Wait 5s between restarts
      env: {
        NODE_ENV: 'production',
        SCHEDULE_DAEMON_ENABLED: 'true',
        SCHEDULE_POLL_INTERVAL_MS: '60000',
        DATABASE_URL: 'mysql://user:password@localhost:3306/internet_date'
      }
    }
  ]
};
