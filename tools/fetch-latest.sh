#!/bin/bash
cd /opt/app/iwin
/usr/local/bin/node tools/fetch-main.js latest >> /var/log/auto-fetch-latest.log 2>&1