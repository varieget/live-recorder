const cluster = require('cluster');
const app = require('./app');
const config = require('./config');

if (cluster.isMaster) {
  config.forEach((roomId) => {
    let worker = cluster.fork();
    worker.send(roomId);
  });
} else if (cluster.isWorker) {
  process.on('message', async (roomId) => {
    await app(roomId);
  });
}
