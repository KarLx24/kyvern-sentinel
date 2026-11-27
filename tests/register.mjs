// Lets Node resolve "three" to the vendored copy, the same way the page's import map does.
import { register } from 'node:module';
register('./resolve.mjs', import.meta.url);
