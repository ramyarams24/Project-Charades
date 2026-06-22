# Project-Charades
The repo consists of code for the game Charades.
1.Install nodejs and check the node and npm versions
  node -v
  npm -v
2.Run command npm init -y this installs all the dependencies required for the project. Also creates the package.json file which has the metadata of the project.So whenever we run the npm install and install something into the project that will be recorded into the package.json file
3.To install the rquired dependencies needed internally by the project now run the command
 npm install Express cors xlsx
4.After successful installation run command node server.js

## AI-generated movie names (optional)

In addition to the spreadsheet-based `/movies` and `/words` endpoints, the backend
can generate fresh, themed movie titles on demand using Claude (Anthropic API).
Uses the `claude-haiku-4-5` model (the most cost-effective option for this task).

Setup:
1. `npm install` (pulls in `@anthropic-ai/sdk` and `dotenv`).
2. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to your key from
   https://console.anthropic.com/ .
3. Start the server (`npm run dev` or `npm start`).

Endpoints:
- `GET /movies/ai/categories` — list the available themes.
- `GET /movies/ai?category=<theme>&count=<n>` — returns a JSON array of movie
  titles for the chosen theme (`hollywood`, `bollywood`, `animated`, `classics`,
  `action`, `mixed`). `count` is clamped to 5–40 (default 20).

If `ANTHROPIC_API_KEY` is not set, `/movies/ai` returns HTTP 503 and the existing
spreadsheet endpoints continue to work normally.
