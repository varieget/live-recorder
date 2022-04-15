import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pwd = (...pathSegments) =>
  path.resolve(
    path.dirname(fileURLToPath(new URL('', import.meta.url))),
    ...pathSegments
  );

const flvPath = [];

async function findRecord(files) {
  for (const filename of files) {
    try {
      const stats = await fs.stat(filename);

      if (stats.isDirectory()) {
        try {
          const files = await fs.readdir(filename);

          await findRecord(files.map((file) => path.join(filename, file)));
        } catch (err) {
          throw new Error(err);
        }
      } else {
        if (/.flv$/.test(filename)) {
          flvPath.push(filename);
        }
      }
    } catch (err) {
      throw new Error(err);
    }
  }
}

try {
  const files = (await fs.readdir(pwd('../')))
    .filter((file) => /^record_\d+$/.test(file))
    .map((file) => pwd('../', file));

  await findRecord(files);

  const hasFlv = [
    ...new Set(
      flvPath.map((file) => {
        const [filename] = file.match(/record_\d+/);
        return filename;
      })
    ),
  ];

  files
    .filter((file) => {
      const [filename] = file.match(/record_\d+/);
      return !hasFlv.includes(filename);
    })
    .forEach(async (file) => {
      await fs.rm(file, { recursive: true });
    });
} catch (err) {
  throw new Error(err);
}
