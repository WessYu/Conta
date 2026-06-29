import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.cp(path.join(root, 'public'), dist, { recursive: true });
await fs.copyFile(path.join(root, 'index.html'), path.join(dist, 'index.html'));

console.log('Build estatico gerado em dist/. Para backend real, use npm start em um host Node com disco persistente.');
