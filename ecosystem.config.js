const path = require('path');

const resolveApp = (relativePath) => path.resolve(__dirname, relativePath);

module.exports = {
  apps: [
    {
      name: 'recorder',
      interpreter: resolveApp('node_modules/.bin/ts-node'),
      script: resolveApp('src/index.ts'),
      env: {
        TS_NODE_PROJECT: resolveApp('tsconfig.json'),
      },
    },
  ],
};
