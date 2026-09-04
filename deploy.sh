#!/bin/sh

set -e

git pull
pnpm build
pm2 restart meeting
pm2 reset meeting
