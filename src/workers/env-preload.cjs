// Loaded via --require before any ESM imports are hoisted.
// This ensures DATABASE_URL and other vars are set before the DB module initialises.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config(); // fallback to .env
