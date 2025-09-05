const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic configuration
const jwtSecret = process.env.JWT_SECRET;
const sfmcConfig = {
    clientId: process.env.SFMC_CLIENT_ID,
    clientSecret: process.env.SFMC_CLIENT_SECRET,
    subdomain: process.env.SFMC_SUBDOMAIN,
    accountId: process.env.SFMC_ACCOUNT_ID
};

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Static files
app.use(express.static('public'));
app.use('/config', express.static(path.join(__dirname, 'config')));

// Basic routes
app.get('/', (req, res) => {
    res.json({ 
        status: 'Server running', 
        timestamp: new Date().toISOString(),
        port: PORT 
    });
});

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

// Configuration routes
app.get('/config', (req, res) => {
    console.log('Config page requested');
    res.sendFile(path.join(__dirname, 'config', 'index.html'));
});

app.get('/config.json', (req, res) => {
    console.log('Config JSON requested');
    res.sendFile(path.join(__dirname, 'activity-config.json'));
});

app.get('/config/config.json', (req, res) => {
    console.log('Config JSON requested via /config/config.json');
    res.sendFile(path.join(__dirname, 'activity-config.json'));
});

// SFMC Journey Builder endpoints
app.post('/save', (req, res) => {
    console.log('Save endpoint called');
    try {
        res.status(200).send('OK');
    } catch (error) {
        console.error('Save error:', error);
        res.status(200).send('OK');
    }
});

app.post('/validate', (req, res) => {
    console.log('Validate endpoint called');
    try {
        res.status(200).send('OK');
    } catch (error) {
        console.error('Validate error:', error);
        res.status(200).send('OK');
    }
});

app.post('/publish', (req, res) => {
    console.log('Publish endpoint called');
    try {
        res.status(200).send('OK');
    } catch (error) {
        console.error('Publish error:', error);
        res.status(200).send('OK');
    }
});

app.post('/execute', (req, res) => {
    console.log('Execute endpoint called');
    try {
        // Simple execution logic
        const token = req.body.keyValue || req.body.jwt || req.body;
        
        if (token && jwtSecret) {
            try {
                const decoded = jwt.verify(typeof token === 'string' ? token : token.toString(), jwtSecret);
                console.log('JWT decoded successfully');
            } catch (jwtError) {
                console.log('JWT validation failed:', jwtError.message);
            }
        }
        
        res.status(200).send('Execute');
    } catch (error) {
        console.error('Execute error:', error);
        res.status(200).send('Execute');
    }
});

app.post('/stop', (req, res) => {
    console.log('Stop endpoint called');
    try {
        res.status(200).send('OK');
    } catch (error) {
        console.error('Stop error:', error);
        res.status(200).send('OK');
    }
});

// Test endpoints
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.post('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    if (!res.headersSent) {
        res.status(200).json({
            status: 'error',
            message: 'Server error',
            timestamp: new Date().toISOString()
        });
    }
});

// 404 handler
app.use('*', (req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
        method: req.method,
        url: req.originalUrl
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Minimal server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Config: http://localhost:${PORT}/config`);
});

// Process error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});