module.exports = {
  apps: [
    {
      name: "tpass-meeting",
      script: "node_modules/.bin/next",
      args: "start -p 3009",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "3009",
        TZ: "Asia/Taipei",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      kill_timeout: 10000,
    },
  ],
};
