// node --import ./preview/register-loader.mjs preview/server.mjs
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
