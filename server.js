const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Your app's secret from Marketing Cloud App Center
const jwtSecret = process.env.JWT_SECRET;
const appExtensionKey = process.env.APP_EXTENSION_KEY;

// SFMC API Configuration
const sfmcConfig = {
    clientId: process.env.SFMC_CLIENT_ID,
    clientSecret: process.env.SFMC_CLIENT_SECRET,
    subdomain: process.env.SFMC_SUBDOMAIN,
    accountId: process.env.SFMC_ACCOUNT_ID
};

// Data Extension Configuration
const dataExtensionConfig = {
    externalKey: process.env.DE_EXTERNAL_KEY || '3010F472-DE73-4A74-BB75-5FD96D878E75',
    name: process.env.DE_NAME || 'Master_Subscriber'
};

// Activity Log Data Extension Configuration (like the example's database table)
const activityLogConfig = {
    externalKey: process.env.ACTIVITY_LOG_DE_KEY || 'CustomActivity_Log',
    name: process.env.ACTIVITY_LOG_DE_NAME || 'Custom_Activity_Execution_Log'
};

// SFMC API Helper Functions - simplified like the example
async function getSFMCAccessToken() {
    const tokenURL = `https://${sfmcConfig.subdomain}.auth.marketingcloudapis.com/v2/token`;
    
    try {
        const response = await axios.post(tokenURL, {
            grant_type: 'client_credentials',
            client_id: sfmcConfig.clientId,
            client_secret: sfmcConfig.clientSecret,
            account_id: sfmcConfig.accountId
        });
        
        return {
            access_token: response.data.access_token,
            rest_instance_url: response.data.rest_instance_url
        };
    } catch (error) {
        console.error('Error retrieving SFMC token:', error.response?.data || error.message);
        throw error;
    }
}

// Function to save activity execution data to SFMC Data Extension (like the example saves to database)
async function saveActivityExecution(data) {
    try {
        const authResult = await getSFMCAccessToken();
        const restBaseUrl = authResult.rest_instance_url || `https://${sfmcConfig.subdomain}.rest.marketingcloudapis.com`;
        const restUrl = `${restBaseUrl}/data/v1/async/dataextensions/key:${activityLogConfig.externalKey}/rows`;
        
        const payload = {
            items: [{
                ContactKey: data.contactKey,
                ActivityUUID: data.uuid,
                ExecutionDate: data.executionDate.toISOString(),
                Status: data.status,
                CustomMessage: data.customMessage,
                ErrorLog: data.errorLog || null
            }]
        };
        
        console.log(`Saving activity execution to log DE: ${activityLogConfig.externalKey}`);
        
        const response = await axios.post(restUrl, payload, {
            headers: {
                'Authorization': `Bearer ${authResult.access_token}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        return response.data;
    } catch (error) {
        console.error('Error saving activity execution to log data extension:', error.response?.data || error.message);
        // Don't throw error for logging failures - just log and continue
        return null;
    }
}

async function updateDataExtensionRow(contactKey, customMessage) {
    try {
        console.log('Getting SFMC access token...');
        const authResult = await getSFMCAccessToken();
        console.log('Access token obtained successfully');
        
        // Use the REST instance URL from the auth response
        const restBaseUrl = authResult.rest_instance_url || `https://${sfmcConfig.subdomain}.rest.marketingcloudapis.com`;
        const restUrl = `${restBaseUrl}/data/v1/async/dataextensions/key:${dataExtensionConfig.externalKey}/rows`;
        
        // Use the correct payload structure for SFMC REST API
        const payload = {
            items: [{
                ContactKey: contactKey,
                CustomText: customMessage
            }]
        };
        
        console.log('Sending request to SFMC:', {
            url: restUrl,
            payload: payload,
            dataExtension: {
                name: dataExtensionConfig.name,
                externalKey: dataExtensionConfig.externalKey
            }
        });
        
        // Use POST for upsert behavior (insert or update)
        const response = await axios.post(restUrl, payload, {
            headers: {
                'Authorization': `Bearer ${authResult.access_token}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 second timeout
        });
        
        console.log('Data Extension update response status:', response.status);
        console.log('Data Extension update response:', response.data);
        return response.data;
        
    } catch (error) {
        console.error('Error updating data extension:');
        console.error('Status:', error.response?.status);
        console.error('Status Text:', error.response?.statusText);
        console.error('Response Data:', error.response?.data);
        console.error('Error Message:', error.message);
        
        // Try alternative payload structure if first attempt fails
        if (error.response?.status === 400) {
            console.log('Trying alternative payload structure with keys/values...');
            try {
                const alternativePayload = {
                    items: [{
                        keys: {
                            ContactKey: contactKey
                        },
                        values: {
                            ContactKey: contactKey,
                            CustomText: customMessage
                        }
                    }]
                };
                
                const alternativeResponse = await axios.post(restUrl, alternativePayload, {
                    headers: {
                        'Authorization': `Bearer ${authResult.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                });
                
                console.log('Alternative payload succeeded:', alternativeResponse.data);
                return alternativeResponse.data;
                
            } catch (altError) {
                console.error('Alternative payload also failed:', altError.response?.data);
            }
        }
        
        // Provide more specific error information
        if (error.response?.status === 401) {
            throw new Error('SFMC Authentication failed - check credentials');
        } else if (error.response?.status === 404) {
            throw new Error(`Data Extension not found: ${dataExtensionConfig.externalKey}`);
        } else if (error.response?.status === 400) {
            throw new Error(`Bad request: ${error.response?.data?.message || 'Invalid data format'}`);
        } else {
            throw new Error(`SFMC API error: ${error.message}`);
        }
    }
}

// Add detailed request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    
    if (req.body) {
        if (typeof req.body === 'string') {
            console.log('Body (string):', req.body.substring(0, 200) + '...');
        } else if (Object.keys(req.body).length > 0) {
            console.log('Body (object):', JSON.stringify(req.body, null, 2));
        } else {
            console.log('Body: empty object');
        }
    } else {
        console.log('Body: null/undefined');
    }
    next();
});

// Middleware
app.use(cors());

// Custom middleware to handle JWT tokens sent as raw text
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
                console.log(`Raw ${contentType} token received:`, body.substring(0, 100) + '...');
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

// Only use JSON parser for non-JWT content
app.use((req, res, next) => {
    const contentType = req.headers['content-type'];
    if (contentType === 'application/jwt' || contentType === 'text/plain') {
        next(); // Skip JSON parsing for JWT content
    } else {
        bodyParser.json({ limit: '10mb' })(req, res, next);
    }
});

app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Error handling middleware for JSON parsing
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        console.error('Bad JSON:', error.message);
        return res.status(200).json({
            status: 'error',
            message: 'Invalid JSON in request body - continuing'
        });
    }
    next(error);
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    if (!res.headersSent) {
        res.status(200).json({
            status: 'error',
            message: 'Internal server error - continuing',
            timestamp: new Date().toISOString()
        });
    }
});

// Serve static files - ORDER MATTERS!
app.use(express.static('public'));
app.use('/config', express.static(path.join(__dirname, 'config')));

// Serve the configuration page
app.get('/config', (req, res) => {
    console.log('Config page requested');
    res.sendFile(path.join(__dirname, 'config', 'index.html'));
});

// Serve config.json for Journey Builder
app.get('/config/config.json', (req, res) => {
    console.log('Config JSON requested');
    res.sendFile(path.join(__dirname, 'activity-config.json'));
});

// Alternative route for config.json (some SFMC versions expect this)
app.get('/config.json', (req, res) => {
    console.log('Direct config.json requested');
    res.sendFile(path.join(__dirname, 'activity-config.json'));
});

// Save endpoint - called when user saves configuration
app.post('/save', (req, res) => {
    console.log('Save endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Set timeout for quick response
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            console.log('Save endpoint timeout - sending success response');
            res.status(200).send('OK');
        }
    }, 1500);
    
    try {
        // Extract configuration data
        const activityObjectID = req.body.activityObjectID;
        const definitionInstanceId = req.body.definitionInstanceId;
        
        console.log('Save details:', {
            activityObjectID,
            definitionInstanceId
        });
        
        // Validate JWT token if present (but don't fail if missing)
        if (req.body.keyValue || req.body.jwt) {
            try {
                const token = req.body.keyValue || req.body.jwt;
                jwt.verify(token, jwtSecret);
                console.log('JWT validated successfully for save');
            } catch (jwtError) {
                console.warn('JWT validation failed in save (continuing anyway):', jwtError.message);
            }
        }
        
        console.log('Save successful for activity:', activityObjectID);
        clearTimeout(timeout);
        
        // Here you can save the configuration to your database
        // For now, just acknowledge the save
        if (!res.headersSent) {
            res.status(200).send('OK');
        }
        
    } catch (error) {
        console.error('Error in save endpoint:', error);
        clearTimeout(timeout);
        
        if (!res.headersSent) {
            res.status(400).send('Save failed');
        }
    }
});

// Execute endpoint - called when contact enters the activity (following example pattern)
app.post('/execute', async (req, res) => {
    try {
        // Extract data from JWT token
        const token = req.body.keyValue || req.body.jwt || req.body;
        
        if (!token) {
            console.error('No JWT token provided in execute request');
            return res.status(200).send('Execute'); // Always return success to continue journey
        }
        
        let decoded;
        try {
            const tokenString = typeof token === 'string' ? token : token.toString();
            decoded = jwt.verify(tokenString, jwtSecret);
        } catch (jwtError) {
            console.error('JWT validation failed:', jwtError.message);
            return res.status(200).send('Execute'); // Continue journey even if JWT fails
        }
        
        // Extract contact and activity data
        const contactKey = decoded.request?.contactKey || 
                          decoded.inArguments?.[0]?.contactKey || 
                          decoded.contactKey || 
                          'UNKNOWN_CONTACT';
                          
        const inArguments = decoded.request?.currentActivity?.arguments?.execute?.inArguments || 
                           decoded.inArguments || 
                           [];
                           
        const customMessage = inArguments.find(arg => arg.customMessage)?.customMessage || 
                             decoded.customMessage ||
                             'Contact processed by custom journey activity';
                             
        const uuid = inArguments.find(arg => arg.uuid)?.uuid || 
                    decoded.uuid || 
                    'unknown-' + Date.now();
        
        console.log(`Processing contact: ${contactKey}, UUID: ${uuid}`);
        
        // Prepare execution data for logging (like the example)
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
            
            // Log the execution (like the example logs to database)
            await saveActivityExecution(executionData);
            
            console.log(`Successfully processed contact: ${contactKey}`);
            
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
        
        res.status(200).send('Execute'); // Simple response like the example
        
    } catch (error) {
        console.error('Error in execute endpoint:', error);
        res.status(200).send('Execute'); // Ensure journey continues
    }
});

// Publish endpoint - called when journey is activated
app.post('/publish', (req, res) => {
    console.log('Publish endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Set timeout to respond quickly (SFMC expects fast responses)
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            console.log('Publish endpoint timeout - sending success response');
            res.status(200).send('OK');
        }
    }, 2000);
    
    try {
        // Extract key information from the request
        const activityObjectID = req.body.activityObjectID;
        const definitionInstanceId = req.body.definitionInstanceId;
        const requestObjectId = req.body.requestObjectId;
        
        console.log('Publish validation details:', {
            activityObjectID,
            definitionInstanceId,
            requestObjectId
        });
        
        // Validate JWT token if present (but don't fail if missing during publish)
        if (req.body.keyValue || req.body.jwt) {
            try {
                const token = req.body.keyValue || req.body.jwt;
                jwt.verify(token, jwtSecret);
                console.log('JWT validated successfully for publish');
            } catch (jwtError) {
                console.warn('JWT validation failed in publish (continuing anyway):', jwtError.message);
                // Don't fail the publish for JWT issues - SFMC sometimes doesn't send JWT during validation
            }
        }
        
        // Perform any custom validation logic here
        // For example, check if required configuration is present
        
        console.log('Publish validation successful');
        clearTimeout(timeout);
        
        // Return simple success response (SFMC prefers simple responses)
        if (!res.headersSent) {
            res.status(200).send('OK');
        }
        
    } catch (error) {
        console.error('Error in publish endpoint:', error);
        clearTimeout(timeout);
        
        if (!res.headersSent) {
            // Return simple error response
            res.status(400).send('Validation failed');
        }
    }
});

// Validate endpoint - called during configuration
app.post('/validate', (req, res) => {
    console.log('Validate endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Set timeout for quick response
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            console.log('Validate endpoint timeout - sending success response');
            res.status(200).send('OK');
        }
    }, 1500);
    
    try {
        // Extract validation information
        const activityObjectID = req.body.activityObjectID;
        const definitionInstanceId = req.body.definitionInstanceId;
        
        console.log('Validation details:', {
            activityObjectID,
            definitionInstanceId
        });
        
        // Validate JWT token if present (but don't fail if missing)
        if (req.body.keyValue || req.body.jwt) {
            try {
                const token = req.body.keyValue || req.body.jwt;
                jwt.verify(token, jwtSecret);
                console.log('JWT validated successfully for validate');
            } catch (jwtError) {
                console.warn('JWT validation failed in validate (continuing anyway):', jwtError.message);
                // Don't fail validation for JWT issues during configuration
            }
        }
        
        console.log('Validation successful for activity:', activityObjectID);
        clearTimeout(timeout);
        
        if (!res.headersSent) {
            res.status(200).send('OK');
        }
        
    } catch (error) {
        console.error('Error in validate endpoint:', error);
        clearTimeout(timeout);
        
        if (!res.headersSent) {
            res.status(400).send('Validation failed');
        }
    }
});

// Stop endpoint - called when contact exits
app.post('/stop', (req, res) => {
    console.log('Stop endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    res.status(200).json({
        status: 'success',
        message: 'Stop processed successfully'
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            port: PORT,
            jwtSecretConfigured: !!jwtSecret,
            appExtensionKeyConfigured: !!appExtensionKey
        }
    });
});

// Debug environment variables
app.get('/debug-env', (req, res) => {
    res.json({
        status: 'debug',
        message: 'Environment variables check',
        sfmcConfig: {
            clientId: sfmcConfig.clientId ? sfmcConfig.clientId.substring(0, 8) + '...' : 'NOT_SET',
            clientSecret: sfmcConfig.clientSecret ? '***SET***' : 'NOT_SET',
            subdomain: sfmcConfig.subdomain || 'NOT_SET',
            accountId: sfmcConfig.accountId || 'NOT_SET'
        },
        authUrl: `https://${sfmcConfig.subdomain}.auth.marketingcloudapis.com/v2/token`,
        expectedSubdomain: 'mcpymzz7w7nbc2rxvym6ydvl-3m4'
    });
});

// Simple ping endpoint for SFMC validation
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.post('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Test JWT parsing endpoint
app.post('/test-jwt', (req, res) => {
    console.log('Test JWT endpoint called');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body type:', typeof req.body);
    console.log('Body:', req.body);
    
    try {
        const token = req.body.keyValue || req.body.jwt || req.body;
        
        if (token) {
            const tokenString = typeof token === 'string' ? token : token.toString();
            const decoded = jwt.verify(tokenString, jwtSecret);
            
            res.json({
                status: 'success',
                message: 'JWT parsed and verified successfully',
                decoded: decoded,
                extractedData: {
                    contactKey: decoded.request?.contactKey || decoded.inArguments?.[0]?.contactKey || 'not_found',
                    journeyId: decoded.request?.currentActivity?.journey?.id || 'not_found',
                    inArguments: decoded.request?.currentActivity?.arguments?.execute?.inArguments || decoded.inArguments || []
                }
            });
        } else {
            res.json({
                status: 'error',
                message: 'No JWT token found',
                body: req.body
            });
        }
    } catch (error) {
        res.json({
            status: 'error',
            message: 'JWT verification failed',
            error: error.message,
            body: req.body
        });
    }
});

// Test endpoint to verify static file serving
app.get('/test', (req, res) => {
    res.json({
        message: 'Server is working correctly',
        availableRoutes: [
            'GET /health',
            'GET /config',
            'GET /config/config.json',
            'GET /config.json',
            'GET /test-sfmc',
            'POST /save',
            'POST /execute',
            'POST /publish',
            'POST /validate',
            'POST /stop'
        ]
    });
});

// Test SFMC connectivity
app.get('/test-sfmc', async (req, res) => {
    try {
        if (!sfmcConfig.clientId || !sfmcConfig.clientSecret || !sfmcConfig.subdomain) {
            return res.json({
                status: 'error',
                message: 'SFMC credentials not configured',
                configured: {
                    clientId: !!sfmcConfig.clientId,
                    clientSecret: !!sfmcConfig.clientSecret,
                    subdomain: !!sfmcConfig.subdomain,
                    accountId: !!sfmcConfig.accountId
                }
            });
        }
        
        const authResult = await getSFMCAccessToken();
        
        res.json({
            status: 'success',
            message: 'SFMC connection successful',
            authResult: {
                tokenReceived: !!authResult.access_token,
                restInstanceUrl: authResult.rest_instance_url
            },
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

// Get activity data by UUID (like the example)
app.get('/activity/:uuid', async (req, res) => {
    const uuid = req.params.uuid;
    
    try {
        const authResult = await getSFMCAccessToken();
        const restBaseUrl = authResult.rest_instance_url || `https://${sfmcConfig.subdomain}.rest.marketingcloudapis.com`;
        
        // Query log data extension for records with this UUID
        const queryUrl = `${restBaseUrl}/data/v1/customobjectdata/key/${activityLogConfig.externalKey}/rowset`;
        
        const response = await axios.get(queryUrl, {
            headers: {
                'Authorization': `Bearer ${authResult.access_token}`,
                'Content-Type': 'application/json'
            },
            params: {
                '$filter': `ActivityUUID eq '${uuid}'`
            }
        });
        
        if (response.data.items && response.data.items.length > 0) {
            res.json(response.data.items);
        } else {
            res.status(404).send('Activity not found');
        }
        
    } catch (error) {
        console.error('Error retrieving activity data:', error.response?.data || error.message);
        res.status(500).send('Internal Server Error');
    }
});

// Test data extension update with sample data
app.get('/test-de-update', async (req, res) => {
    try {
        if (!sfmcConfig.clientId || !sfmcConfig.clientSecret || !sfmcConfig.subdomain) {
            return res.json({
                status: 'error',
                message: 'SFMC credentials not configured',
                requiredEnvVars: [
                    'SFMC_CLIENT_ID',
                    'SFMC_CLIENT_SECRET', 
                    'SFMC_SUBDOMAIN'
                ]
            });
        }
        
        const testContactKey = 'TEST_CONTACT_' + Date.now();
        const testMessage = 'Test message from custom activity - ' + new Date().toISOString();
        
        console.log('Testing data extension update...');
        const result = await updateDataExtensionRow(testContactKey, testMessage);
        
        res.json({
            status: 'success',
            message: 'Data extension update test successful',
            testData: {
                contactKey: testContactKey,
                customMessage: testMessage
            },
            result: result
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Data extension update test failed',
            error: error.message
        });
    }
});

// Debug endpoint to check data extension structure
app.get('/debug-de', async (req, res) => {
    try {
        if (!sfmcConfig.clientId || !sfmcConfig.clientSecret || !sfmcConfig.subdomain) {
            return res.json({
                status: 'error',
                message: 'SFMC credentials not configured'
            });
        }
        
        const authResult = await getSFMCAccessToken();
        
        // Get data extension details using the correct REST instance URL
        const restBaseUrl = authResult.rest_instance_url || `https://${sfmcConfig.subdomain}.rest.marketingcloudapis.com`;
        const deUrl = `${restBaseUrl}/data/v1/async/dataextensions/key:${dataExtensionConfig.externalKey}`;
        
        const response = await axios.get(deUrl, {
            headers: {
                'Authorization': `Bearer ${authResult.access_token}`,
                'Content-Type': 'application/json'
            }
        });
        
        res.json({
            status: 'success',
            message: 'Data extension details retrieved',
            dataExtension: response.data,
            config: {
                externalKey: dataExtensionConfig.externalKey,
                name: dataExtensionConfig.name
            },
            restBaseUrl: restBaseUrl
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to get data extension details',
            error: error.message,
            response: error.response?.data
        });
    }
});

// Test endpoint for Journey Builder validation
app.get('/test-endpoints', (req, res) => {
    res.json({
        status: 'success',
        message: 'All endpoints are accessible',
        endpoints: {
            save: 'POST /save',
            execute: 'POST /execute', 
            publish: 'POST /publish',
            validate: 'POST /validate',
            stop: 'POST /stop'
        },
        configuration: {
            jwtSecretConfigured: !!jwtSecret,
            appExtensionKeyConfigured: !!appExtensionKey,
            serverRunning: true
        }
    });
});

// Test all POST endpoints with empty body (simulates SFMC validation)
app.get('/test-validation', async (req, res) => {
    const results = {};
    const baseUrl = `https://sfmc-customjourney-activity.onrender.com`;
    
    try {
        // Test each endpoint
        const endpoints = ['save', 'validate', 'publish', 'stop'];
        
        for (const endpoint of endpoints) {
            try {
                const response = await axios.post(`${baseUrl}/${endpoint}`, {
                    activityObjectID: 'test-activity-id',
                    definitionInstanceId: 'test-definition-id'
                }, {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                results[endpoint] = {
                    status: 'success',
                    statusCode: response.status,
                    response: response.data
                };
            } catch (error) {
                results[endpoint] = {
                    status: 'error',
                    statusCode: error.response?.status || 'timeout',
                    error: error.message
                };
            }
        }
        
        res.json({
            status: 'test_complete',
            message: 'Endpoint validation test completed',
            results: results
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Test failed',
            error: error.message
        });
    }
});

// Catch-all error handler for undefined routes
app.use('*', (req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
        method: req.method,
        url: req.originalUrl
    });
});

// Add process error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit, just log the error
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Configuration URL: https://sfmc-customjourney-activity.onrender.com/config`);
    console.log(`Health check: https://sfmc-customjourney-activity.onrender.com/health`);
    console.log(`Test execute: https://sfmc-customjourney-activity.onrender.com/test-jwt`);
});
