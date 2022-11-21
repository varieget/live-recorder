import fs from 'node:fs';
import path from 'node:path';

const pwd = (...paths: string[]) => path.resolve(__dirname, ...paths);

const flvPath: string[] = [];

function findRecord(files: string[]) {
  for (const filename of files) {
    try {
      const stats = fs.statSync(filename);

      if (stats.isDirectory()) {
        try {
          const files = fs.readdirSync(filename);
          findRecord(files.map((file) => path.join(filename, file)));
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
  const files = fs
    .readdirSync(pwd('../'))
    .filter((file) => /^record_\d+$/.test(file))
    .map((file) => pwd('../', file));

  findRecord(files);

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
    .forEach((file) => {
      fs.rmSync(file, { recursive: true });
    });
} catch (err) {
  throw new Error(err);
}
