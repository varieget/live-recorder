import cluster from 'node:cluster';
import process from 'node:process';

import app from './app.js';
import config from './config.js';

if (cluster.isPrimary) {
  config.forEach((roomId) => {
    let worker = cluster.fork();

    // See issues: #39854, #37782
    // See PR: #41221
    setTimeout(() => {
      worker.send(roomId);
    }, 1000);
  });
} else if (cluster.isWorker) {
  process.on('message', async (roomId) => {
    await app(roomId);
  });
}
