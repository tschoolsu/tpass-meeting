#!/bin/sh

set -e

git pull
pnpm build
pm2 restart tpass-meeting
pm2 reset tpass-meeting
