// Serve /config/index.html for SFMC iframe loader
app.get('/config/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'config.html'));
});
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Your app's secret from Marketing Cloud App Center
require('dotenv').config();
const jwtSecret = process.env.JWT_SECRET;
const appExtensionKey = process.env.APP_EXTENSION_KEY;

// Serve the configuration page
app.get('/config', (req, res) => {
    res.sendFile(path.join(__dirname, 'config.html'));
});
    
    // Serve config.json for Journey Builder
    app.get('/config/config.json', (req, res) => {
        console.log('Config JSON requested');
        const config = {
            workflowApiVersion: "1.1",
            metaData: {
                icon: "https://raw.githubusercontent.com/mallowigi/a-file-icon-vscode/master/logo.png?sanitize=true",
                category: "message",
                displayName: "Custom Flag Activity",
                description: "A simple custom activity that adds flags and logs contact processing"
            },
            type: "REST",
            lang: {
                "en-US": {
                    name: "Custom Flag Activity",
                    description: "Adds custom flags and processes contacts in Journey Builder"
                }
            },
            arguments: {
                execute: {
                    inArguments: [
                        {
                            contactKey: "{{Contact.Key}}",
                            emailAddress: "{{InteractionDefaults.Email}}",
                            firstName: "{{Contact.Attribute.Demographics.FirstName}}",
                            lastName: "{{Contact.Attribute.Demographics.LastName}}"
                        }
                    ],
                    outArguments: [],
                    url: `https://sfmc-customjourney-activity.onrender.com/execute`,
                    verb: "POST",
                    body: "",
                    format: "json",
                    useJwt: true,
                    timeout: 10000
                }
            },
            configurationArguments: {
                applicationExtensionKey: appExtensionKey,
                save: {
                    url: `https://sfmc-customjourney-activity.onrender.com/save`,
                    verb: "POST",
                    useJwt: true
                },
                publish: {
                    url: `https://sfmc-customjourney-activity.onrender.com/publish`,
                    verb: "POST",
                    useJwt: true
                },
                validate: {
                    url: `https://sfmc-customjourney-activity.onrender.com/validate`,
                    verb: "POST",
                    useJwt: true
                },
                stop: {
                    url: `https://sfmc-customjourney-activity.onrender.com/stop`,
                    verb: "POST",
                    useJwt: true
                }
            },
            wizardSteps: [
                {
                    label: "Configure Activity",
                    key: "step1"
                }
            ],
            userInterfaces: {
                configModal: {
                    height: 600,
                    width: 800,
                    fullscreen: false
                }
            }
        };
        res.json(config);
    });
    
    // Serve config.js for Journey Builder
    app.get('/config/config.js', (req, res) => {
        console.log('Config JS requested');
        const configJs = `
        // Direct config.json for SFMC (no /config prefix)
        app.get('/config.json', (req, res) => {
            console.log('Direct /config.json requested');
            // Reuse the same config as /config/config.json
            const config = {
                workflowApiVersion: "1.1",
                metaData: {
                    icon: "https://raw.githubusercontent.com/mallowigi/a-file-icon-vscode/master/logo.png?sanitize=true",
                    category: "message",
                    displayName: "Custom Flag Activity",
                    description: "A simple custom activity that adds flags and logs contact processing"
                },
                type: "REST",
                lang: {
                    "en-US": {
                        name: "Custom Flag Activity",
                        description: "Adds custom flags and processes contacts in Journey Builder"
                    }
                },
                arguments: {
                    execute: {
                        inArguments: [
                            {
                                contactKey: "{{Contact.Key}}",
                                emailAddress: "{{InteractionDefaults.Email}}",
                                firstName: "{{Contact.Attribute.Demographics.FirstName}}",
                                lastName: "{{Contact.Attribute.Demographics.LastName}}"
                            }
                        ],
                        outArguments: [],
                        url: `https://sfmc-customjourney-activity.onrender.com/execute`,
                        verb: "POST",
                        body: "",
                        format: "json",
                        useJwt: true,
                        timeout: 10000
                    }
                },
                configurationArguments: {
                    applicationExtensionKey: appExtensionKey,
                    save: {
                        url: `https://sfmc-customjourney-activity.onrender.com/save`,
                        verb: "POST",
                        useJwt: true
                    },
                    publish: {
                        url: `https://sfmc-customjourney-activity.onrender.com/publish`,
                        verb: "POST",
                        useJwt: true
                    },
                    validate: {
                        url: `https://sfmc-customjourney-activity.onrender.com/validate`,
                        verb: "POST",
                        useJwt: true
                    },
                    stop: {
                        url: `https://sfmc-customjourney-activity.onrender.com/stop`,
                        verb: "POST",
                        useJwt: true
                    }
                },
                wizardSteps: [
                    {
                        label: "Configure Activity",
                        key: "step1"
                    }
                ],
                userInterfaces: {
                    configModal: {
                        height: 600,
                        width: 800,
                        fullscreen: false
                    }
                }
            };
            res.json(config);
        });

        // Direct config.js for SFMC (no /config prefix)
        app.get('/config.js', (req, res) => {
            console.log('Direct /config.js requested');
            // Reuse the same JS as /config/config.js
            const configJs = `
            // Custom Activity Configuration
            define(['postmonger'], function (Postmonger) {
                'use strict';
                var connection = new Postmonger.Session();
                var authTokens = {};
                var payload = {};
                $(window).ready(onRender);
                connection.on('initActivity', initialize);
                connection.on('requestedTokens', onGetTokens);
                connection.on('requestedEndpoints', onGetEndpoints);
                connection.trigger('ready');
                function onRender() {
                    connection.trigger('requestTokens');
                    connection.trigger('requestEndpoints');
                }
                function initialize(data) {
                    if (data) { payload = data; }
                    var hasInArguments = Boolean(
                        payload['arguments'] &&
                        payload['arguments'].execute &&
                        payload['arguments'].execute.inArguments &&
                        payload['arguments'].execute.inArguments.length > 0
                    );
                    var inArguments = hasInArguments ? payload['arguments'].execute.inArguments : {};
                    console.log(inArguments);
                    connection.trigger('updateButton', { button: 'next', text: 'done', visible: true });
                }
                function onGetTokens(tokens) {
                    console.log(tokens);
                    authTokens = tokens;
                }
                function onGetEndpoints(endpoints) {
                    console.log(endpoints);
                }
                function save() {
                    var customFlag = $('#customFlag').val();
                    var customMessage = $('#customMessage').val();
                    payload['arguments'].execute.inArguments = [{
                        "tokens": authTokens,
                        "customFlag": customFlag,
                        "customMessage": customMessage
                    }];
                    payload['metaData'].isConfigured = true;
                    connection.trigger('updateActivity', payload);
                }
                return { save: save };
            });
        `;
            res.set('Content-Type', 'application/javascript');
            res.send(configJs);
        });
        res.set('Content-Type', 'application/javascript');
        res.send(configJs);
    });

// Execute endpoint - called when contact enters the activity
app.post('/execute', (req, res) => {
    console.log('Execute endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Decode the JWT token to get contact and journey data
        const token = req.body.keyValue || req.body.jwt;
        const decoded = jwt.verify(token, jwtSecret);
        
        console.log('Decoded JWT:', decoded);
        
        // Extract contact data
        const contactKey = decoded.request?.contactKey;
        const journeyId = decoded.request?.currentActivity?.journey?.id;
        const activityId = decoded.request?.currentActivity?.id;
        
        console.log(`Processing contact: ${contactKey} in journey: ${journeyId}`);
        
        // Your custom logic here
        // For example, log that this contact passed through your activity
        const timestamp = new Date().toISOString();
        const flagData = {
            contactKey: contactKey,
            journeyId: journeyId,
            activityId: activityId,
            timestamp: timestamp,
            customFlag: 'CUSTOM_ACTIVITY_PROCESSED',
            customMessage: 'Contact successfully processed by custom activity'
        };
        
        // In a real implementation, you would:
        // 1. Save this data to your database
        // 2. Call Marketing Cloud APIs to update contact attributes
        // 3. Send data to external systems
        // 4. Perform your business logic
        
        console.log('Custom activity processing completed:', flagData);
        
        // Respond with success
        res.status(200).json({
            status: 'success',
            message: 'Contact processed successfully',
            data: flagData
        });
        
    } catch (error) {
        console.error('Error in execute endpoint:', error);
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

// Publish endpoint - called when journey is activated
app.post('/publish', (req, res) => {
    console.log('Publish endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Validate configuration
        const config = req.body.configuration;
        
        // Perform any validation logic here
        if (!config || !config.arguments) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid configuration'
            });
        }
        
        console.log('Configuration validated successfully');
        
        res.status(200).json({
            status: 'success',
            message: 'Configuration is valid'
        });
        
    } catch (error) {
        console.error('Error in publish endpoint:', error);
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

// Validate endpoint - called during configuration
app.post('/validate', (req, res) => {
    console.log('Validate endpoint called');
    
    res.status(200).json({
        status: 'success',
        message: 'Validation successful'
    });
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
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Configuration URL: https://sfmc-customjourney-activity.onrender.com/config`);
});

// Package.json dependencies needed:
/*
{
  "name": "jb-custom-activity",
  "version": "1.0.0",
  "description": "Basic Journey Builder Custom Activity",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "body-parser": "^1.20.2",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
*/