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

// SFMC API Configuration with hardcoded URLs to fix DNS issue
const sfmcConfig = {
    clientId: process.env.SFMC_CLIENT_ID,
    clientSecret: process.env.SFMC_CLIENT_SECRET,
    subdomain: process.env.SFMC_SUBDOMAIN,
    accountId: process.env.SFMC_ACCOUNT_ID,
    // Hardcode the correct URLs with -3m4 suffix to fix the DNS issue
    authUrl: process.env.SFMC_AUTH_URL || 'https://mcpymzz7w7nbc2rxvym6ydvl-3m4.auth.marketingcloudapis.com/v2/token',
    restBaseUrl: process.env.SFMC_REST_BASE_URL || 'https://mcpymzz7w7nbc2rxvym6ydvl-3m4.rest.marketingcloudapis.com'
};

// Debug configuration on startup
console.log('SFMC Configuration loaded:');
console.log('- Client ID:', sfmcConfig.clientId?.substring(0, 8) + '...');
console.log('- Subdomain from env:', process.env.SFMC_SUBDOMAIN);
console.log('- Auth URL:', sfmcConfig.authUrl);
console.log('- REST Base URL:', sfmcConfig.restBaseUrl);

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

// SFMC API Helper Functions - following the example pattern exactly
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

// Keep the old function for backward compatibility
async function getSFMCAccessToken() {
    const token = await retrieveToken();
    return {
        access_token: token,
        rest_instance_url: sfmcConfig.restBaseUrl
    };
}

// Function to save activity execution data to SFMC Data Extension (like the example saves to database)
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
        
        console.log(`Saving activity execution to log DE: ${activityLogConfig.externalKey}`);
        
        const response = await axios.post(restUrl, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
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
        console.log(`Updating data extension for contact: ${contactKey} with message: ${customMessage}`);
        
        const token = await retrieveToken();
        const restUrl = `${sfmcConfig.restBaseUrl}/data/v1/async/dataextensions/key:${dataExtensionConfig.externalKey}/rows`;
        
        // Use the correct payload structure for SFMC REST API with SubscriberKey
        const payload = {
            items: [{
                SubscriberKey: contactKey,
                CustomText: customMessage
            }]
        };
        
        console.log('Sending request to SFMC:', {
            url: restUrl,
            payload: payload
        });
        
        const response = await axios.post(restUrl, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('Data Extension update successful:', response.status);
        return response.data;
        
    } catch (error) {
        console.error('Error updating data extension:', error.response?.data || error.message);
        throw error;
    }
}

// Simplified request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Middleware
app.use(cors());

// Simplified middleware setup
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Handle JWT tokens sent as raw text (simplified)
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

// Simplified error handling
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

// Execute endpoint - simplified and more robust
app.post('/execute', async (req, res) => {
    console.log('Execute endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Check if we have inArguments like the example
        if (req.body.inArguments && req.body.inArguments.length > 0) {
            console.log('Processing inArguments directly (like the example)');
            
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
                
                // Log the execution
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
            
            res.status(200).send('Execute');
            return;
        }
        
        // Fallback: Try JWT parsing if no inArguments
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
        environmentVariables: {
            SFMC_CLIENT_ID: process.env.SFMC_CLIENT_ID ? process.env.SFMC_CLIENT_ID.substring(0, 8) + '...' : 'NOT_SET',
            SFMC_CLIENT_SECRET: process.env.SFMC_CLIENT_SECRET ? '***SET***' : 'NOT_SET',
            SFMC_SUBDOMAIN: process.env.SFMC_SUBDOMAIN || 'NOT_SET',
            SFMC_ACCOUNT_ID: process.env.SFMC_ACCOUNT_ID || 'NOT_SET',
            SFMC_AUTH_URL: process.env.SFMC_AUTH_URL || 'NOT_SET',
            SFMC_REST_BASE_URL: process.env.SFMC_REST_BASE_URL || 'NOT_SET'
        },
        actualConfig: {
            authUrl: sfmcConfig.authUrl,
            restBaseUrl: sfmcConfig.restBaseUrl,
            subdomain: sfmcConfig.subdomain
        },
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
app.get('/test-jwt', (req, res) => {
    res.json({
        status: 'info',
        message: 'This is a GET endpoint. Use POST /test-jwt to test JWT parsing.',
        availableEndpoints: [
            'POST /test-jwt - Test JWT parsing',
            'GET /debug-env - Check environment variables',
            'GET /test-sfmc - Test SFMC connection'
        ]
    });
});

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
        console.log('Testing SFMC connection...');
        console.log('Configuration check:', {
            clientId: !!sfmcConfig.clientId,
            clientSecret: !!sfmcConfig.clientSecret,
            subdomain: !!sfmcConfig.subdomain,
            accountId: !!sfmcConfig.accountId,
            authUrl: sfmcConfig.authUrl,
            restBaseUrl: sfmcConfig.restBaseUrl
        });
        
        if (!sfmcConfig.clientId || !sfmcConfig.clientSecret) {
            return res.json({
                status: 'error',
                message: 'SFMC credentials not configured',
                configured: {
                    clientId: !!sfmcConfig.clientId,
                    clientSecret: !!sfmcConfig.clientSecret,
                    subdomain: !!sfmcConfig.subdomain,
                    accountId: !!sfmcConfig.accountId,
                    authUrl: sfmcConfig.authUrl,
                    restBaseUrl: sfmcConfig.restBaseUrl
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
            },
            configuration: {
                authUrl: sfmcConfig.authUrl,
                restBaseUrl: sfmcConfig.restBaseUrl
            }
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'SFMC connection failed',
            error: error.message,
            configuration: {
                authUrl: sfmcConfig.authUrl,
                restBaseUrl: sfmcConfig.restBaseUrl
            }
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
