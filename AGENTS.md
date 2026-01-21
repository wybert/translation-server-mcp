# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Koa server and endpoint handlers (`webEndpoint.js`, `searchEndpoint.js`, `exportEndpoint.js`, `importEndpoint.js`).
- `modules/`: Translator and Zotero-related submodules vendored into the repo.
- `test/`: Mocha tests, fixtures in `test/data/`, and translator fixtures in `test/testTranslators/`.
- `config/`: Runtime configuration via `node-config` (`default.json5`, `test.json`).
- Root scripts: Docker and Lambda helpers such as `Dockerfile`, `lambda_local_test`, and `lambda_deploy`.

## Build, Test, and Development Commands
```bash
npm install               # install dependencies
npm start                 # run the server on :1969
npm run start:debug       # run with Node inspector
npm test                  # full test suite
npm run test:import       # focused import tests

docker build -t translation-server .
docker run -ti -p 1969:1969 --rm translation-server

./lambda_local_test lambda_config.env
./lambda_deploy lambda_config.env
```

## Coding Style & Naming Conventions
- JavaScript is CommonJS (`require`, `module.exports`) and targets Node.
- Indentation uses tabs; keep existing formatting and align with ESLint rules.
- File naming follows `camelCase` in `src/` (for example, `webSession.js`).
- Linting is configured via `@zotero/eslint-config` in `.eslintrc`.

## Testing Guidelines
- Test stack: Mocha, Chai, Sinon, Supertest.
- Name new tests as `*_test.js` and place them in `test/`.
- Prefer fixtures under `test/data/` and keep network interactions mocked.

## MCP Server Extension (for integrations)
- Place MCP server code in a dedicated entrypoint such as `mcp/` (or `src/mcp/` if sharing runtime).
- Expose tools that map to translation-server endpoints (web/search/import/export) plus a save step.
- Prefer the connector API when Zotero Desktop is open (no local API key required).
- Zotero Desktop: call the local API (default `http://127.0.0.1:23119`) and require `ZOTERO_LOCAL_API_KEY`.
- Zotero Web: call `https://api.zotero.org/` using `ZOTERO_WEB_API_KEY` and library IDs (for example, `ZOTERO_WEB_LIBRARY_TYPE=users`, `ZOTERO_WEB_LIBRARY_ID=123456`).
- For other apps, add adapters under `mcp/connectors/` with a shared `save(items, options)` interface.
- Avoid logging full item payloads by default; enable verbose logging only for local debugging.

## Commit & Pull Request Guidelines
- Commit messages are short, imperative, sentence case (for example, "Fix XMLSerializer shim").
- PRs should include: a concise summary, test commands run, and any config or API changes.
- If endpoints change, add or update a curl example in the PR description.

## Configuration & Security Notes
- Use `config/` defaults and environment variables for overrides.
- Do not commit secrets; use `lambda_config.env` locally (copy from `lambda_config.env-sample`).
- For production usage, set `USER_AGENT` and any proxy variables (`HTTP_PROXY`, `HTTPS_PROXY`).
