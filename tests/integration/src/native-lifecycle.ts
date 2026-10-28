import { transientLifecycle } from './lifecycle.js';
console.log(JSON.stringify(await transientLifecycle()));
