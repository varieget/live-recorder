import fs from 'node:fs/promises';
import path from 'node:path';

const pwd = (...paths: string[]) => path.resolve(import.meta.dirname, ...paths);

const flvPath: string[] = [];

async function findRecord(files: string[]) {
  for (const filename of files) {
    try {
      const stats = await fs.stat(filename).catch(() => null);

      if (stats?.isDirectory()) {
        try {
          const files = await fs.readdir(filename);
          await findRecord(files.map((file) => path.join(filename, file)));
        } catch (err) {
          throw err;
        }
      } else {
        if (/.flv$/.test(filename)) {
          flvPath.push(filename);
        }
      }
    } catch (err) {
      throw err;
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
        const [filename] = file.match(/record_\d+/)!;
        return filename;
      })
    ),
  ];

  files
    .filter((file) => {
      const [filename] = file.match(/record_\d+/)!;
      return !hasFlv.includes(filename);
    })
    .forEach(async (file) => {
      await fs.rm(file, { recursive: true });
    });
} catch (err) {
  throw err;
}
