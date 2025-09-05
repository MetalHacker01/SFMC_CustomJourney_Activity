# Render.com Environment Variables Setup

## Critical: Set These Environment Variables in Render.com Dashboard

Go to your Render.com service dashboard → Environment tab and add these variables:

### Required Environment Variables:

```
JWT_SECRET=IKlEbhmxV4O2x-iNhf1h1xD9W7l9O2wsZkKVin8jsDal42jTo5XwacvjgRhA_1FWVkZXtUQAmdVntyH7kqbXZ_F2vMq5y7AI6uwbSRpptBLKo3ATnjwt9k3QXhSW5zy5vwzL1Srvbff7U3bIk8KVCT2X6IoQRofvDrWARH63sg97tnEPzDaQO6ZI6kmm1GBWxaW6I_Yh-41B87gVkLopqinG0zHC223ducT953rjqBvf_M8hIrGcWGXmM_NJ3A2

APP_EXTENSION_KEY=a21d9560-1a53-40dc-b70e-df88851a07fb

SFMC_CLIENT_ID=2y8uak265iaick4fcm02ft3a

SFMC_CLIENT_SECRET=vXYSRk4SaKULRn64XdjdAD6s

SFMC_SUBDOMAIN=mcpymzz7w7nbc2rxvym6ydvl-3m4

SFMC_ACCOUNT_ID=514000767

SFMC_AUTH_URL=https://mcpymzz7w7nbc2rxvym6ydvl-3m4.auth.marketingcloudapis.com/v2/token

SFMC_REST_BASE_URL=https://mcpymzz7w7nbc2rxvym6ydvl-3m4.rest.marketingcloudapis.com

DE_EXTERNAL_KEY=3010F472-DE73-4A74-BB75-5FD96D878E75

DE_NAME=Master_Subscriber
```

## Important Notes:

1. **The `-3m4` suffix is critical** - without it, DNS resolution will fail
2. **Set each variable individually** in the Render.com dashboard
3. **Redeploy after setting variables** for changes to take effect

## Testing After Setup:

1. Visit: `https://your-app.onrender.com/debug-env` to verify variables are loaded
2. Visit: `https://your-app.onrender.com/test-sfmc` to test SFMC connection
3. Test the journey in SFMC Journey Builder

## Current Issue:

The logs show the server is trying to connect to:
`mcpymzz7w7nbc2rxvym6ydvl.auth.marketingcloudapis.com` (missing `-3m4`)

This means either:
- The `SFMC_SUBDOMAIN` variable is set incorrectly on Render.com
- The `SFMC_AUTH_URL` variable is not set at all

## Quick Fix:

The server now has hardcoded URLs as fallbacks, but you should still set the environment variables properly for production use.