const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Your app's secret from Marketing Cloud App Center
const jwtSecret = process.env.JWT_SECRET;
const appExtensionKey = process.env.APP_EXTENSION_KEY;

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
    
    try {
        // Here you can save the configuration to your database
        // For now, just acknowledge the save
        res.status(200).json({
            status: 'success',
            message: 'Configuration saved successfully'
        });
        
    } catch (error) {
        console.error('Error in save endpoint:', error);
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
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
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            port: PORT,
            jwtSecretConfigured: !!jwtSecret,
            appExtensionKeyConfigured: !!appExtensionKey
        }
    });
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
            'POST /save',
            'POST /execute',
            'POST /publish',
            'POST /validate',
            'POST /stop'
        ]
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Configuration URL: https://sfmc-customjourney-activity.onrender.com/config`);
    console.log(`Health check: https://sfmc-customjourney-activity.onrender.com/health`);
});
