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
        
        const response = await axios.post(authUrl, {
            grant_type: 'client_credentials',
            client_id: sfmcConfig.clientId,
            client_secret: sfmcConfig.clientSecret,
            account_id: sfmcConfig.accountId
        });
        
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting SFMC access token:', error.response?.data || error.message);
        throw error;
    }
}

async function updateDataExtensionRow(contactKey, customMessage) {
    try {
        const accessToken = await getSFMCAccessToken();
        
        const restUrl = `https://${sfmcConfig.subdomain}.rest.marketingcloudapis.com/data/v1/async/dataextensions/key:${dataExtensionConfig.externalKey}/rows`;
        
        const payload = {
            items: [{
                ContactKey: contactKey,
                CustomText: customMessage
            }]
        };
        
        const response = await axios.put(restUrl, payload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Data Extension update response:', response.data);
        return response.data;
        
    } catch (error) {
        console.error('Error updating data extension:', error.response?.data || error.message);
        throw error;
    }
}

// Add detailed request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Error handling middleware for JSON parsing
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        console.error('Bad JSON:', error.message);
        return res.status(400).json({
            status: 'error',
            message: 'Invalid JSON in request body'
        });
    }
    next();
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
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Validate that we have a JWT token
        const token = req.body.keyValue || req.body.jwt;
        if (!token) {
            console.error('No JWT token provided in execute request');
            return res.status(400).json({
                status: 'error',
                message: 'No JWT token provided'
            });
        }
        
        // Decode the JWT token to get contact and journey data
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret);
            console.log('JWT decoded successfully in execute');
        } catch (jwtError) {
            console.error('JWT validation failed in execute:', jwtError.message);
            return res.status(401).json({
                status: 'error',
                message: 'Invalid JWT token'
            });
        }
        
        console.log('Decoded JWT:', decoded);
        
        // Extract contact data from the JWT
        const contactKey = decoded.request?.contactKey;
        const journeyId = decoded.request?.currentActivity?.journey?.id;
        const activityId = decoded.request?.currentActivity?.id;
        
        // Extract the custom message from inArguments
        const inArguments = decoded.request?.currentActivity?.arguments?.execute?.inArguments || [];
        const customMessage = inArguments.find(arg => arg.customMessage)?.customMessage || 'Default message from custom activity';
        
        console.log(`Processing contact: ${contactKey} in journey: ${journeyId}`);
        console.log(`Custom message to write: ${customMessage}`);
        
        // Check if we have the required SFMC credentials
        if (!sfmcConfig.clientId || !sfmcConfig.clientSecret || !sfmcConfig.subdomain) {
            console.warn('SFMC credentials not configured, skipping data extension update');
            
            // Return success but log that we skipped the update
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
            const updateResult = await updateDataExtensionRow(contactKey, customMessage);
            
            console.log(`Successfully updated data extension for contact: ${contactKey}`);
            
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
        
        // Always return 200 for execute endpoint to prevent journey failures
        // SFMC expects 200 even if there are processing errors
        res.status(200).json({
            status: 'error',
            message: 'Processing failed but contact will continue in journey',
            error: error.message,
            timestamp: new Date().toISOString()
        });
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Configuration URL: https://sfmc-customjourney-activity.onrender.com/config`);
    console.log(`Health check: https://sfmc-customjourney-activity.onrender.com/health`);
});
