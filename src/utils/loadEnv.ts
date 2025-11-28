/*
 * Simple `.env` loader for environments without external dependencies.
 *
 * This module reads a `.env` file from the current working directory and
 * populates `process.env` with variables defined in it. Lines starting
 * with `#` are treated as comments and ignored. Keys that already exist
 * in `process.env` are not overwritten. Quotes around values are stripped.
 *
 * It is imported at the top of `src/index.ts` so that configuration from
 * `.env` is available immediately when the app starts.
 */

import fs from 'fs';
import path from 'path';

(() => {
    try {
        const envFile = path.resolve(process.cwd(), '.env');
        if (!fs.existsSync(envFile)) {
            return;
        }
        const contents = fs.readFileSync(envFile, 'utf-8');
        contents.split(/\r?\n/).forEach((line) => {
            if (!line) return;
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('#')) return;
            const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (!match) return;
            const key = match[1];
            let value = match[2].trim();
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        });
    } catch {
        // Silently ignore any errors reading the .env file.
    }
})();