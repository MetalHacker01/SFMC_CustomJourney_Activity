# SFMC Custom Activity Setup Guide

## 1. Get SFMC API Credentials

### Step 1: Create an Installed Package in SFMC
1. Go to **Setup** > **Apps** > **Installed Packages**
2. Click **New** to create a new package
3. Enter package details:
   - Name: "Custom Journey Activity"
   - Description: "Custom activity for updating data extensions"

### Step 2: Add API Integration Component
1. Click **Add Component** > **API Integration**
2. Set **Integration Type**: Server-to-Server
3. Set **Permissions**:
   - Data Extensions: **Read** and **Write**
   - Journeys: **Read** (if needed)
4. Save the component

### Step 3: Get Credentials
After saving, you'll get:
- **Client ID**
- **Client Secret** 
- **Authentication Base URI** (extract subdomain from this)
- **REST Base URI** (extract subdomain from this)

Example Authentication URI: `https://mc123456789.auth.marketingcloudapis.com/`
Your subdomain is: `mc123456789`

## 2. Update Environment Variables

Update your `.env` file with the actual values:

```env
SFMC_CLIENT_ID=your_actual_client_id_here
SFMC_CLIENT_SECRET=your_actual_client_secret_here
SFMC_SUBDOMAIN=mc123456789
SFMC_ACCOUNT_ID=your_account_id_here
```

## 3. Verify Data Extension Structure

Your `Master_Subscriber` data extension should have:
- **ContactKey** (Text, Primary Key)
- **CustomText** (Text, nullable)

## 4. Test the Integration

1. **Test SFMC Connection:**
   ```
   GET https://sfmc-customjourney-activity.onrender.com/test-sfmc
   ```

2. **Debug Data Extension:**
   ```
   GET https://sfmc-customjourney-activity.onrender.com/debug-de
   ```

3. **Test Data Extension Update:**
   ```
   GET https://sfmc-customjourney-activity.onrender.com/test-de-update
   ```

## 5. Common Issues

### Authentication Errors (401)
- Check Client ID and Client Secret
- Verify subdomain is correct
- Ensure API permissions are granted

### Data Extension Not Found (404)
- Verify External Key: `3010F472-DE73-4A74-BB75-5FD96D878E75`
- Check if data extension exists in the same business unit
- Verify API user has access to the data extension

### Bad Request (400)
- Check field names match exactly (case-sensitive)
- Verify ContactKey exists in the data extension
- Ensure CustomText field exists and is writable

## 6. Field Mapping

The activity expects:
- **Input**: ContactKey from Journey Builder
- **Output**: Updates CustomText field in Master_Subscriber DE

Make sure your data extension has these exact field names.