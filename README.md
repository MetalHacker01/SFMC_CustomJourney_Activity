# SFMC Custom Journey Builder Activity

This project is a Salesforce Marketing Cloud (SFMC) Custom Journey Builder Activity built with Node.js and Express. It provides a REST API and a configuration UI for use in Journey Builder custom activities.

## Features
- Custom Journey Builder Activity endpoints (execute, publish, validate, stop)
- Secure JWT validation
- Configurable via `.env` for secrets and keys
- Ready for deployment on Render.com, Heroku, or any Node.js host
- Modern config UI with Postmonger integration

## Getting Started

### Prerequisites
- Node.js (v16+ recommended)
- npm

### Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/MetalHacker01/SFMC_CustomJourney_Activity.git
   cd SFMC_CustomJourney_Activity
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a `.env` file in the root directory with your secrets:
   ```env
   JWT_SECRET=your_jwt_secret_here
   APP_EXTENSION_KEY=your_app_extension_key_here
   ```

### Running Locally
```sh
npm start
```
The server will run on `http://localhost:3000` by default.

### Deploying to Render.com
- Push your code to GitHub.
- Create a new Web Service on Render.com, connect your repo, and set the environment variables in the Render dashboard.
- Use the generated Render URL for your SFMC endpoints.

### Environment Variables
- `JWT_SECRET`: Your JWT signing secret from SFMC App Center
- `APP_EXTENSION_KEY`: Your App Extension Key from SFMC App Center

### Endpoints
- `/config` - Configuration UI for Journey Builder
- `/config/config.json` - Activity metadata for SFMC
- `/config/config.js` - JS config for SFMC
- `/execute`, `/publish`, `/validate`, `/stop` - Activity endpoints
- `/health` - Health check

### Security
- Do **not** commit your `.env` file to version control.
- Secrets are loaded from environment variables.

## License
MIT

---

> Built for Salesforce Marketing Cloud Journey Builder custom activity development.
