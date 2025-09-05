// Simple test server to verify basic functionality
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/config', express.static(path.join(__dirname, 'config')));

// Test endpoints
app.get('/', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', port: PORT });
});

app.get('/config', (req, res) => {
    console.log('Config page requested');
    res.sendFile(path.join(__dirname, 'config', 'index.html'));
});

app.get('/config.json', (req, res) => {
    console.log('Config JSON requested');
    res.sendFile(path.join(__dirname, 'activity-config.json'));
});

// SFMC endpoints with minimal logic
app.post('/save', (req, res) => {
    console.log('Save called');
    res.status(200).send('OK');
});

app.post('/validate', (req, res) => {
    console.log('Validate called');
    res.status(200).send('OK');
});

app.post('/publish', (req, res) => {
    console.log('Publish called');
    res.status(200).send('OK');
});

app.post('/execute', (req, res) => {
    console.log('Execute called');
    res.status(200).send('Execute');
});

app.post('/stop', (req, res) => {
    console.log('Stop called');
    res.status(200).send('OK');
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
});