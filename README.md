# Gen AI Analytics Simulation (Node.js)

A Node.js implementation of a Gen AI Analytics query simulation backend.

## Features

- JWT authentication
- Natural language to pseudo-SQL translation
- Query execution simulation
- Query explanation and validation
- In-memory mock database

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with your `SECRET_KEY`
4. Start the server: `npm run dev` (development) or `npm start` (production)

## API Endpoints

### Authentication
- `POST /token` - Get JWT token (send `username` and `password` in JSON body)

### Protected Endpoints (require Authorization header with Bearer token)
- `POST /query` - Process natural language query
- `POST /explain` - Explain query processing
- `POST /validate` - Validate query feasibility

## Testing

Use the provided `test_requests.http` file with VS Code REST Client or import into Postman.

## Deployment

Deploy to:
- Render
link- https://genai-analytics-sim-node.onrender.com
