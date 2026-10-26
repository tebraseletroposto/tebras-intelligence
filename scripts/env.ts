import { config } from "dotenv";
// Carrega .env.local (desenvolvimento) e depois .env, sem sobrescrever variáveis já definidas.
config({ path: ".env.local", quiet: true });
config({ quiet: true });
