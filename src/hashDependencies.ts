import { checkSumOfFiles } from './checkSum';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import * as dependencyTree from 'dependency-tree';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

/**
 * Hashes the dependencies of a lambda
 */
export const hashDependencies = async (args: {
  name: string;
  src: string;
  srcDir: string;
  outDir: string;
  tsConfig: string;
  ignoreFolders?: string[];
}): Promise<{
  checksum: string;
  hashes: { [key: string]: string };
  files: string[];
}> => {
  const { srcDir, src, name, tsConfig, ignoreFolders } = args;
  // Cache dependencies
  const dependenciesFile = path.resolve(args.outDir, `${name}.deps.json`);
  try {
    const { files, checksum } = JSON.parse(
      await readFile(dependenciesFile, 'utf-8'),
    );
    const res = await checkSumOfFiles(files);
    if (res.checksum !== checksum) {
      // One of the file has changed, throw away the cached dependencies, since there might be more changes.
      fs.unlinkSync(dependenciesFile);
      return hashDependencies({
        ...args,
        name,
      });
    }
    return res;
  } catch (_) {
    // calculate the checksum for the file, which is the checksum of the file itself,
    // and of the intra-project dependencies
    const deps = dependencyTree.toList({
      filename: src,
      directory: srcDir,
      // @ts-ignore
      tsConfig,
      filter: (sourceFile: string) =>
        sourceFile.indexOf('node_modules') === -1 && ignoreFolders // do not look at module dependencies
          ? ignoreFolders.reduce(
              (pass, folder) => {
                if (!pass) {
                  return false;
                }
                return sourceFile.indexOf(folder) === -1;
              },
              true as boolean,
            )
          : true, // ignore other folders
    });
    const intraProjectDeps = deps.filter(
      (path: string) => path.indexOf('node_modules') === -1,
    );
    const res = await checkSumOfFiles([src, ...intraProjectDeps]);
    await writeFile(
      dependenciesFile,
      JSON.stringify({
        files: [src, ...intraProjectDeps],
        checksum: res.checksum,
      }),
      'utf-8',
    );
    return res;
  }
};
