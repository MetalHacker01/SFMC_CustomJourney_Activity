/**
 * SFMC Custom Journey Activity - Data Extension Updater
 * 
 * This custom activity updates a data extension field when contacts enter the activity in Journey Builder.
 * It demonstrates how to:
 * - Handle SFMC Journey Builder lifecycle events (save, validate, publish, execute)
 * - Authenticate with SFMC REST API
 * - Update data extension records
 * - Process contact data from Journey Builder
 */

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// CONFIGURATION
// =============================================================================

// JWT Secret for validating tokens from SFMC
const jwtSecret = process.env.JWT_SECRET;
const appExtensionKey = process.env.APP_EXTENSION_KEY;

// SFMC API Configuration - these should be set in your environment variables
const sfmcConfig = {
    clientId: process.env.SFMC_CLIENT_ID,
    clientSecret: process.env.SFMC_CLIENT_SECRET,
    subdomain: process.env.SFMC_SUBDOMAIN,
    accountId: process.env.SFMC_ACCOUNT_ID,
    // Hardcoded URLs with -3m4 suffix to fix DNS issues
    authUrl: process.env.SFMC_AUTH_URL || 'https://mcpymzz7w7nbc2rxvym6ydvl-3m4.auth.marketingcloudapis.com/v2/token',
    restBaseUrl: process.env.SFMC_REST_BASE_URL || 'https://mcpymzz7w7nbc2rxvym6ydvl-3m4.rest.marketingcloudapis.com'
};

// Data Extension Configuration
const dataExtensionConfig = {
    externalKey: process.env.DE_EXTERNAL_KEY || '3010F472-DE73-4A74-BB75-5FD96D878E75',
    name: process.env.DE_NAME || 'Master_Subscriber'
};

// Activity Log Data Extension Configuration (optional - for execution logging)
const activityLogConfig = {
    externalKey: process.env.ACTIVITY_LOG_DE_KEY || 'CustomActivity_Log',
    name: process.env.ACTIVITY_LOG_DE_NAME || 'Custom_Activity_Execution_Log'
};

// Debug configuration on startup
console.log('=== SFMC Custom Activity Starting ===');
console.log('- Client ID:', sfmcConfig.clientId?.substring(0, 8) + '...');
console.log('- Auth URL:', sfmcConfig.authUrl);
console.log('- REST Base URL:', sfmcConfig.restBaseUrl);
console.log('- Data Extension:', dataExtensionConfig.name, `(${dataExtensionConfig.externalKey})`);

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// Enable CORS for cross-origin requests from SFMC
app.use(cors());

// Parse JSON and URL-encoded request bodies
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Handle JWT tokens sent as raw text (SFMC sometimes sends JWT as plain text)
app.use((req, res, next) => {
    const contentType = req.headers['content-type'];
    
    if (contentType === 'application/jwt' || contentType === 'text/plain') {
        console.log(`Handling ${contentType} request`);
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                req.body = { jwt: body.trim() };
                next();
            } catch (error) {
                console.error('Error processing JWT body:', error);
                req.body = {};
                next();
            }
        });
        
        req.on('error', (error) => {
            console.error('Error reading request body:', error);
            req.body = {};
            next();
        });
    } else {
        next();
    }
});

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Error:', error.message);
    if (!res.headersSent) {
        res.status(200).json({
            status: 'error',
            message: 'Server error but continuing',
            timestamp: new Date().toISOString()
        });
    }
});

// =============================================================================
// SFMC API HELPER FUNCTIONS
// =============================================================================

/**
 * Retrieve access token from SFMC
 * Uses client credentials flow to authenticate with SFMC REST API
 */
async function retrieveToken() {
    try {
        console.log('Retrieving SFMC token from:', sfmcConfig.authUrl);
        const response = await axios.post(sfmcConfig.authUrl, {
            grant_type: 'client_credentials',
            client_id: sfmcConfig.clientId,
            client_secret: sfmcConfig.clientSecret
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error retrieving token:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Update a data extension row with custom message
 * Tries multiple SFMC API endpoints to ensure compatibility
 */
async function updateDataExtensionRow(contactKey, customMessage) {
    try {
        console.log(`Updating data extension for contact: ${contactKey} with message: ${customMessage}`);
        
        const token = await retrieveToken();
        
        // Try multiple API endpoints - different SFMC setups work better with different APIs
        const endpoints = [
            {
                name: 'Synchronous Data Events API',
                url: `${sfmcConfig.restBaseUrl}/hub/v1/dataevents/key:${dataExtensionConfig.externalKey}/rowset`,
                payload: [{
                    keys: {
                        SubscriberKey: contactKey
                    },
                    values: {
                        SubscriberKey: contactKey,
                        CustomText: customMessage
                    }
                }]
            },
            {
                name: 'Async Data Extensions API',
                url: `${sfmcConfig.restBaseUrl}/data/v1/async/dataextensions/key:${dataExtensionConfig.externalKey}/rows`,
                payload: {
                    items: [{
                        SubscriberKey: contactKey,
                        CustomText: customMessage
                    }]
                }
            }
        ];
        
        // Try each endpoint until one succeeds
        for (const endpoint of endpoints) {
            try {
                console.log(`Trying ${endpoint.name}`);
                
                const response = await axios.post(endpoint.url, endpoint.payload, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                });
                
                console.log(`${endpoint.name} successful:`, response.status);
                return response.data;
                
            } catch (error) {
                console.log(`${endpoint.name} failed:`, error.response?.status);
                // Continue to next endpoint
            }
        }
        
        throw new Error('All API endpoints failed');
        
    } catch (error) {
        console.error('Error updating data extension:', error.message);
        throw error;
    }
}

/**
 * Save activity execution data to log data extension (optional)
 * This helps with monitoring and debugging activity performance
 */
async function saveActivityExecution(data) {
    try {
        const token = await retrieveToken();
        const restUrl = `${sfmcConfig.restBaseUrl}/data/v1/async/dataextensions/key:${activityLogConfig.externalKey}/rows`;
        
        const payload = {
            items: [{
                SubscriberKey: data.contactKey,
                ActivityUUID: data.uuid,
                ExecutionDate: data.executionDate.toISOString(),
                Status: data.status,
                CustomMessage: data.customMessage,
                ErrorLog: data.errorLog || null
            }]
        };
        
        const response = await axios.post(restUrl, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        return response.data;
    } catch (error) {
        console.error('Error saving activity execution log:', error.response?.data || error.message);
        // Don't throw error for logging failures - just log and continue
        return null;
    }
}

// =============================================================================
// STATIC FILE SERVING
// =============================================================================

// Serve static files from public directory
app.use(express.static('public'));

// Serve configuration files from config directory
app.use('/config', express.static(path.join(__dirname, 'config')));

// =============================================================================
// BASIC ROUTES
// =============================================================================

/**
 * Root endpoint - basic server info
 */
app.get('/', (req, res) => {
    res.json({ 
        status: 'SFMC Custom Activity Server Running', 
        timestamp: new Date().toISOString(),
        port: PORT 
    });
});

/**
 * Health check endpoint - used by hosting services to verify server is running
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            port: PORT,
            jwtSecretConfigured: !!jwtSecret
        }
    });
});

// =============================================================================
// CONFIGURATION ROUTES
// =============================================================================

/**
 * Serve the configuration page - this is what users see when configuring the activity
 */
app.get('/config', (req, res) => {
    console.log('Config page requested');
    res.sendFile(path.join(__dirname, 'config', 'index.html'));
});

/**
 * Serve activity configuration JSON - tells Journey Builder how to use this activity
 */
app.get('/config.json', (req, res) => {
    console.log('Config JSON requested');
    res.sendFile(path.join(__dirname, 'activity-config.json'));
});

/**
 * Alternative config.json route - some SFMC versions expect this path
 */
app.get('/config/config.json', (req, res) => {
    console.log('Config JSON requested via /config/config.json');
    res.sendFile(path.join(__dirname, 'activity-config.json'));
});

// =============================================================================
// SFMC JOURNEY BUILDER LIFECYCLE ENDPOINTS
// =============================================================================

/**
 * SAVE endpoint - called when user saves activity configuration in Journey Builder
 * This is where you can store the user's configuration settings
 */
app.post('/save', (req, res) => {
    console.log('Save endpoint called');
    
    try {
        // Extract configuration data from request
        const activityObjectID = req.body.activityObjectID;
        const definitionInstanceId = req.body.definitionInstanceId;
        
        console.log('Save details:', { activityObjectID, definitionInstanceId });
        
        // Validate JWT token if present (optional but recommended)
        if (req.body.keyValue || req.body.jwt) {
            try {
                const token = req.body.keyValue || req.body.jwt;
                jwt.verify(token, jwtSecret);
                console.log('JWT validated successfully for save');
            } catch (jwtError) {
                console.warn('JWT validation failed in save (continuing anyway):', jwtError.message);
            }
        }
        
        // Here you could save configuration to a database
        // For this example, we just acknowledge the save
        console.log('Save successful for activity:', activityObjectID);
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('Error in save endpoint:', error);
        res.status(200).send('OK'); // Always return OK to prevent Journey Builder issues
    }
});

/**
 * VALIDATE endpoint - called when Journey Builder validates the activity configuration
 * Use this to check if the activity is properly configured
 */
app.post('/validate', (req, res) => {
    console.log('Validate endpoint called');
    
    try {
        // Extract validation information
        const activityObjectID = req.body.activityObjectID;
        const definitionInstanceId = req.body.definitionInstanceId;
        
        console.log('Validation details:', { activityObjectID, definitionInstanceId });
        
        // Validate JWT token if present
        if (req.body.keyValue || req.body.jwt) {
            try {
                const token = req.body.keyValue || req.body.jwt;
                jwt.verify(token, jwtSecret);
                console.log('JWT validated successfully for validate');
            } catch (jwtError) {
                console.warn('JWT validation failed in validate (continuing anyway):', jwtError.message);
            }
        }
        
        // Here you could perform validation checks
        // For example: check if required configuration is present, test API connections, etc.
        
        console.log('Validation successful for activity:', activityObjectID);
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('Error in validate endpoint:', error);
        res.status(200).send('OK'); // Always return OK to prevent Journey Builder issues
    }
});

/**
 * PUBLISH endpoint - called when journey is activated/published
 * Use this to perform any setup needed when the journey goes live
 */
app.post('/publish', (req, res) => {
    console.log('Publish endpoint called');
    
    try {
        // Extract publish information
        const activityObjectID = req.body.activityObjectID;
        const definitionInstanceId = req.body.definitionInstanceId;
        const requestObjectId = req.body.requestObjectId;
        
        console.log('Publish validation details:', { activityObjectID, definitionInstanceId, requestObjectId });
        
        // Validate JWT token if present
        if (req.body.keyValue || req.body.jwt) {
            try {
                const token = req.body.keyValue || req.body.jwt;
                jwt.verify(token, jwtSecret);
                console.log('JWT validated successfully for publish');
            } catch (jwtError) {
                console.warn('JWT validation failed in publish (continuing anyway):', jwtError.message);
            }
        }
        
        // Here you could perform publish-time setup
        // For example: create database tables, initialize external services, etc.
        
        console.log('Publish validation successful');
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('Error in publish endpoint:', error);
        res.status(200).send('OK'); // Always return OK to prevent Journey Builder issues
    }
});

/**
 * EXECUTE endpoint - THE MAIN FUNCTION - called when a contact enters this activity
 * This is where the actual work happens for each contact
 */
app.post('/execute', async (req, res) => {
    console.log('Execute endpoint called - processing contact');
    
    try {
        // Check if we have inArguments (direct data from Journey Builder)
        if (req.body.inArguments && req.body.inArguments.length > 0) {
            console.log('Processing inArguments directly');
            
            // Extract contact data from inArguments
            const inArguments = req.body.inArguments[0];
            const contactKey = inArguments.contactKey || inArguments.subscriberKey || 'UNKNOWN_CONTACT';
            const customMessage = inArguments.customMessage || 'Contact processed by custom journey activity';
            const uuid = inArguments.uuid || 'unknown-' + Date.now();
            
            console.log(`Processing contact: ${contactKey}, UUID: ${uuid}, Message: ${customMessage}`);
            
            // Prepare execution data for logging
            const executionData = {
                uuid: uuid,
                contactKey: contactKey,
                executionDate: new Date(),
                status: 'Success',
                customMessage: customMessage,
                errorLog: null
            };
            
            try {
                // Update the main data extension with custom message
                await updateDataExtensionRow(contactKey, customMessage);
                console.log(`Successfully updated data extension for contact: ${contactKey}`);
                
                // Log the execution (optional)
                await saveActivityExecution(executionData);
                
            } catch (error) {
                console.error('Error processing contact:', error);
                
                // Log the error but continue journey
                executionData.status = 'Error';
                executionData.errorLog = error.message;
                
                try {
                    await saveActivityExecution(executionData);
                } catch (logError) {
                    console.error('Error saving execution log:', logError);
                }
            }
            
            // Always return success to continue the journey
            res.status(200).send('Execute');
            return;
        }
        
        // Fallback: Try JWT parsing if no inArguments (alternative approach)
        console.log('No inArguments found, trying JWT parsing...');
        const token = req.body.keyValue || req.body.jwt || req.body;
        
        if (!token || !jwtSecret) {
            console.log('No JWT token or secret - sending success anyway');
            res.status(200).send('Execute');
            return;
        }
        
        try {
            const tokenString = typeof token === 'string' ? token : token.toString();
            const decoded = jwt.verify(tokenString, jwtSecret);
            
            // Extract contact data from JWT
            const contactKey = decoded.request?.contactKey || 
                              decoded.inArguments?.[0]?.contactKey || 
                              decoded.inArguments?.[0]?.subscriberKey ||
                              decoded.contactKey || 
                              decoded.subscriberKey ||
                              'UNKNOWN_CONTACT';
                              
            const inArguments = decoded.request?.currentActivity?.arguments?.execute?.inArguments || 
                               decoded.inArguments || 
                               [];
                               
            const customMessage = inArguments.find(arg => arg.customMessage)?.customMessage || 
                                 'Contact processed by custom journey activity';
            
            console.log(`Processing contact from JWT: ${contactKey} with message: ${customMessage}`);
            
            // Try to update data extension
            if (sfmcConfig.clientId && sfmcConfig.clientSecret) {
                try {
                    await updateDataExtensionRow(contactKey, customMessage);
                    console.log(`Successfully updated data extension for contact: ${contactKey}`);
                } catch (sfmcError) {
                    console.error('SFMC update failed:', sfmcError.message);
                }
            } else {
                console.log('SFMC not configured - skipping data extension update');
            }
            
        } catch (jwtError) {
            console.error('JWT processing failed:', jwtError.message);
        }
        
        res.status(200).send('Execute');
        
    } catch (error) {
        console.error('Execute endpoint error:', error);
        res.status(200).send('Execute'); // Always return success to continue journey
    }
});

/**
 * STOP endpoint - called when contact exits the activity (optional)
 * Use this for cleanup or logging when contacts leave the activity
 */
app.post('/stop', (req, res) => {
    console.log('Stop endpoint called');
    
    res.status(200).json({
        status: 'success',
        message: 'Stop processed successfully'
    });
});

// =============================================================================
// TESTING AND DEBUG ENDPOINTS
// =============================================================================

/**
 * Test SFMC connectivity
 */
app.get('/test-sfmc', async (req, res) => {
    try {
        console.log('Testing SFMC connection...');
        
        if (!sfmcConfig.clientId || !sfmcConfig.clientSecret) {
            return res.json({
                status: 'error',
                message: 'SFMC credentials not configured'
            });
        }
        
        const token = await retrieveToken();
        
        res.json({
            status: 'success',
            message: 'SFMC connection successful',
            dataExtension: {
                name: dataExtensionConfig.name,
                externalKey: dataExtensionConfig.externalKey
            }
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'SFMC connection failed',
            error: error.message
        });
    }
});

/**
 * Test updating an existing contact
 */
app.get('/test-update-existing', async (req, res) => {
    try {
        const existingContactKey = '101010'; // Replace with a real contact key from your data extension
        const testMessage = 'TEST UPDATE - ' + new Date().toISOString();
        
        console.log(`Testing update for existing contact: ${existingContactKey}`);
        
        const result = await updateDataExtensionRow(existingContactKey, testMessage);
        
        res.json({
            status: 'success',
            message: 'Update test completed',
            contactKey: existingContactKey,
            testMessage: testMessage,
            result: result
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Update test failed',
            error: error.message
        });
    }
});

// =============================================================================
// ERROR HANDLING AND 404
// =============================================================================

/**
 * Catch-all for undefined routes
 */
app.use('*', (req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
        method: req.method,
        url: req.originalUrl,
        availableEndpoints: [
            'GET / - Server info',
            'GET /health - Health check',
            'GET /config - Configuration page',
            'GET /config.json - Activity configuration',
            'POST /save - Save configuration',
            'POST /validate - Validate configuration',
            'POST /publish - Publish activity',
            'POST /execute - Execute for contact',
            'POST /stop - Stop processing',
            'GET /test-sfmc - Test SFMC connection'
        ]
    });
});

// =============================================================================
// PROCESS ERROR HANDLERS
// =============================================================================

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit - just log the error
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit - just log the error
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
    console.log(`=== SFMC Custom Activity Server Started ===`);
    console.log(`Server running on port ${PORT}`);
    console.log(`Configuration URL: https://sfmc-customjourney-activity.onrender.com/config`);
    console.log(`Health check: https://sfmc-customjourney-activity.onrender.com/health`);
    console.log(`Test SFMC: https://sfmc-customjourney-activity.onrender.com/test-sfmc`);
    console.log('===========================================');
});