const path = require('path');

const resolveApp = (relativePath) => path.resolve(__dirname, relativePath);

module.exports = {
  apps: [
    {
      name: 'recorder',
      interpreter: 'node',
      interpreterArgs: '--import jiti/register',
      script: resolveApp('src/index.ts'),
    },
  ],
};
