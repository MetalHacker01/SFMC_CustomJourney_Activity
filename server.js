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

// SFMC API Helper Functions
async function getSFMCAccessToken() {
    try {
        const authUrl = `https://${sfmcConfig.subdomain}.auth.marketingcloudapis.com/v2/token`;
        
        console.log('Requesting SFMC token from:', authUrl);
        console.log('Using client ID:', sfmcConfig.clientId?.substring(0, 8) + '...');
        
        const response = await axios.post(authUrl, {
            grant_type: 'client_credentials',
            client_id: sfmcConfig.clientId,
            client_secret: sfmcConfig.clientSecret,
            scope: 'data_extensions_read data_extensions_write'
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        console.log('Token response received:', {
            token_type: response.data.token_type,
            expires_in: response.data.expires_in,
            scope: response.data.scope
        });
        
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting SFMC access token:');
        console.error('Status:', error.response?.status);
        console.error('Response:', error.response?.data);
        console.error('Message:', error.message);
        throw error;
    }
}

async function updateDataExtensionRow(contactKey, customMessage) {
    try {
        console.log('Getting SFMC access token...');
        const accessToken = await getSFMCAccessToken();
        console.log('Access token obtained successfully');
        
        // Use synchronous endpoint (not async) - based on SFMC best practices
        const restUrl = `https://${sfmcConfig.subdomain}.rest.marketingcloudapis.com/data/v1/async/dataextensions/key:${dataExtensionConfig.externalKey}/rows`;
        
        // Try different payload structures based on SFMC documentation
        const payload = {
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
        
        console.log('Sending request to SFMC:', {
            url: restUrl,
            payload: payload,
            dataExtension: {
                name: dataExtensionConfig.name,
                externalKey: dataExtensionConfig.externalKey
            }
        });
        
        // Try POST first (upsert behavior)
        const response = await axios.post(restUrl, payload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
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
            console.log('Trying alternative payload structure...');
            try {
                const alternativePayload = {
                    items: [{
                        ContactKey: contactKey,
                        CustomText: customMessage
                    }]
                };
                
                const alternativeResponse = await axios.post(restUrl, alternativePayload, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
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

// Execute endpoint - called when contact enters the activity
app.post('/execute', async (req, res) => {
    console.log('Execute endpoint called');
    
    // Set a timeout to ensure we always respond
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            console.log('Execute timeout - sending default response');
            res.status(200).json({
                status: 'timeout',
                message: 'Request timed out but contact continues',
                timestamp: new Date().toISOString()
            });
        }
    }, 25000); // 25 second timeout
    
    try {
        console.log('Request body type:', typeof req.body);
        console.log('Request body keys:', Object.keys(req.body || {}));
        console.log('Content-Type:', req.headers['content-type']);
        
        // Extract JWT token from various possible locations
        const token = req.body.keyValue || req.body.jwt || req.body;
        
        if (!token) {
            console.error('No JWT token provided in execute request');
            clearTimeout(timeout);
            return res.status(200).json({
                status: 'error',
                message: 'No JWT token provided - contact will continue in journey',
                timestamp: new Date().toISOString()
            });
        }
        
        // Decode the JWT token to get contact and journey data
        let decoded;
        try {
            const tokenString = typeof token === 'string' ? token : token.toString();
            console.log('Attempting to decode JWT token...');
            decoded = jwt.verify(tokenString, jwtSecret);
            console.log('JWT decoded successfully');
        } catch (jwtError) {
            console.error('JWT validation failed:', jwtError.message);
            clearTimeout(timeout);
            return res.status(200).json({
                status: 'error',
                message: 'Invalid JWT token - contact will continue in journey',
                error: jwtError.message,
                timestamp: new Date().toISOString()
            });
        }
        
        console.log('JWT decoded successfully, extracting data...');
        console.log('Full decoded JWT structure:', JSON.stringify(decoded, null, 2));
        
        // Extract contact data from the JWT - try multiple possible locations
        const contactKey = decoded.request?.contactKey || 
                          decoded.inArguments?.[0]?.contactKey || 
                          decoded.contactKey || 
                          'UNKNOWN_CONTACT';
                          
        const journeyId = decoded.request?.currentActivity?.journey?.id || 
                         decoded.journeyId || 
                         'unknown';
                         
        const activityId = decoded.request?.currentActivity?.id || 
                          decoded.activityId || 
                          'unknown';
        
        // Extract the custom message from inArguments - try multiple locations
        const inArguments = decoded.request?.currentActivity?.arguments?.execute?.inArguments || 
                           decoded.inArguments || 
                           [];
                           
        const customMessage = inArguments.find(arg => arg.customMessage)?.customMessage || 
                             decoded.customMessage ||
                             'Contact processed by custom journey activity';
        
        console.log('Extracted data:', {
            contactKey,
            journeyId, 
            activityId,
            customMessage,
            inArgumentsLength: inArguments.length
        });
        
        console.log(`Processing contact: ${contactKey} in journey: ${journeyId}`);
        console.log(`Custom message to write: ${customMessage}`);
        
        // Check if we have the required SFMC credentials
        if (!sfmcConfig.clientId || !sfmcConfig.clientSecret || !sfmcConfig.subdomain) {
            console.warn('SFMC credentials not configured, skipping data extension update');
            clearTimeout(timeout);
            
            return res.status(200).json({
                status: 'success',
                message: 'Contact processed successfully (SFMC update skipped - credentials not configured)',
                data: {
                    contactKey: contactKey,
                    journeyId: journeyId,
                    activityId: activityId,
                    customMessage: customMessage,
                    timestamp: new Date().toISOString(),
                    sfmcUpdateSkipped: true
                }
            });
        }
        
        // Update the data extension with the custom message
        try {
            console.log(`Attempting to update data extension for contact: ${contactKey}`);
            console.log(`Message to write: ${customMessage}`);
            
            const updateResult = await updateDataExtensionRow(contactKey, customMessage);
            
            console.log(`Successfully updated data extension for contact: ${contactKey}`);
            clearTimeout(timeout);
            
            // Respond with success
            res.status(200).json({
                status: 'success',
                message: 'Contact processed and data extension updated successfully',
                data: {
                    contactKey: contactKey,
                    journeyId: journeyId,
                    activityId: activityId,
                    customMessage: customMessage,
                    timestamp: new Date().toISOString(),
                    dataExtension: {
                        externalKey: dataExtensionConfig.externalKey,
                        name: dataExtensionConfig.name
                    },
                    sfmcUpdateResult: updateResult
                }
            });
            
        } catch (sfmcError) {
            console.error('Failed to update SFMC data extension:', sfmcError);
            clearTimeout(timeout);
            
            // Still return success but indicate the SFMC update failed
            res.status(200).json({
                status: 'partial_success',
                message: 'Contact processed but data extension update failed',
                data: {
                    contactKey: contactKey,
                    journeyId: journeyId,
                    activityId: activityId,
                    customMessage: customMessage,
                    timestamp: new Date().toISOString(),
                    error: sfmcError.message
                }
            });
        }
        
    } catch (error) {
        console.error('Error in execute endpoint:', error);
        clearTimeout(timeout);
        
        // Always return 200 for execute endpoint to prevent journey failures
        if (!res.headersSent) {
            res.status(200).json({
                status: 'error',
                message: 'Processing failed but contact will continue in journey',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
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
        
        const accessToken = await getSFMCAccessToken();
        
        res.json({
            status: 'success',
            message: 'SFMC connection successful',
            dataExtension: {
                name: dataExtensionConfig.name,
                externalKey: dataExtensionConfig.externalKey
            },
            tokenReceived: !!accessToken
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'SFMC connection failed',
            error: error.message
        });
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
        
        const accessToken = await getSFMCAccessToken();
        
        // Get data extension details
        const deUrl = `https://${sfmcConfig.subdomain}.rest.marketingcloudapis.com/data/v1/async/dataextensions/key:${dataExtensionConfig.externalKey}`;
        
        const response = await axios.get(deUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
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
            }
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
