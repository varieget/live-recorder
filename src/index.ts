import cluster from 'node:cluster';
import process from 'node:process';

import app from './app.ts';
import { config } from './config.ts';

if (cluster.isPrimary) {
  config.forEach((roomId) => {
    const worker = cluster.fork();

    // See issues: #39854, #37782
    // See PR: #41221
    worker.on('message', (message) => {
      if (message === 'success') {
        worker.send(roomId);
      }
    });
  });
} else if (cluster.isWorker) {
  process.send?.('success');

  process.on('message', async (roomId: number) => {
    await app(roomId);
  });
}
