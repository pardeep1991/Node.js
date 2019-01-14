#!/bin/bash
cd /opt/app/iwin
/usr/local/bin/node tools/fetch-main.js history > /var/log/auto-fetch-history.log 2>&1