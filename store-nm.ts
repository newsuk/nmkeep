import { createWriteStream } from "fs";
import { access, readdir } from "fs-extra";
import Logger from "./logger";
import * as lzma from "lzma-native";
import * as path from "path";
import * as tar from "tar";
import { Dir, FilePath, Options, Bins } from "./typings";
import {
  applyToMonoPkgs,
  getBins,
  getCompressedName,
  getMonoConfig,
  getYarnLockId,
  makeBinDepKey,
  makeCacheDir,
  sendToS3
} from "./utils";

const makeArchive = (dest: FilePath, cwd: Dir) =>
  new Promise((res, rej) => {
    const compressor = lzma.createCompressor();
    const output = createWriteStream(getCompressedName(dest));

    output.on("close", res);
    output.on("error", rej);

    tar
      .c(
        {
          cwd
        },
        ["node_modules"]
      )
      .pipe(compressor)
      .pipe(output);
  });

const cacheModulesById = async (
  logger: Logger,
  cwd: Dir,
  dir: Dir,
  id: string
) => {
  const archive = path.resolve(dir, id);

  try {
    await access(getCompressedName(archive));

    logger.info(`Archive already exists for ${path.join(cwd, "node_modules")}`);

    return;
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw new Error(e);
    }
  }

  await makeArchive(archive, cwd);
};

const getNonHoisted = (pjPath: FilePath, nm: string[]) =>
  nm.filter(pkg => pkg !== ".bin").map(pkg => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { version } = require(path.resolve(
      pjPath,
      `../node_modules/${pkg}/package.json`
    ));

    return `${pkg}@${version}`;
  });

const getModuleContents = async (
  logger: Logger,
  pjPath: FilePath,
  cwd: Dir
) => {
  try {
    return await readdir(path.join(cwd, "node_modules"));
  } catch (e) {
    logger.warn(`${pjPath} has no node_modules for caching`);
    return null;
  }
};

const cacheByPackageJson = async (
  logger: Logger,
  cacheDir: Dir,
  bins: Bins,
  pjPath: FilePath
) => {
  const cacheCWD = path.resolve(pjPath, "../");
  const contents = await getModuleContents(logger, pjPath, cacheCWD);

  if (!contents) {
    return;
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { name, version, devDependencies, dependencies } = require(pjPath);
  const pkgVersion = `${name}@${version}`;
  const nonHoisted = getNonHoisted(pjPath, contents);

  if (nonHoisted.length > 0) {
    logger.warn(
      `${pkgVersion} has unhoisted packages; ${nonHoisted.join(
        ", "
      )}. All node_modules will be cached instead.`
    );

    return cacheModulesById(
      logger,
      cacheCWD,
      cacheDir,
      pkgVersion.replace("/", "_")
    );
  }

  const binId = makeBinDepKey(bins, { ...devDependencies, ...dependencies });

  if (!binId) {
    logger.warn(`${pjPath} has no bin references`);

    return;
  }

  return cacheModulesById(logger, cacheCWD, cacheDir, binId);
};

export default async (
  cwd: Dir,
  { S3, remote, cache, monoConfigPath, isVerbose }: Options
) => {
  const t0 = Date.now();

  const logger = new Logger({ isVerbose });
  const nmId = await getYarnLockId(cwd);
  const cacheDir = await makeCacheDir(logger, cache);

  logger.log("Caching node modules...");

  await cacheModulesById(logger, cwd, cacheDir, nmId);

  logger.log("Modules cached!");

  const monoConfig = getMonoConfig(cwd, monoConfigPath);

  if (monoConfig) {
    logger.log("Caching packages...");

    const bins = await getBins(cwd);

    if (!bins) {
      logger.warn("No bin found in node_modules");
    }

    await applyToMonoPkgs(
      cwd,
      monoConfig,
      async pjPath =>
        await cacheByPackageJson(logger, cacheDir, bins, path.join(cwd, pjPath))
    );
  }

  logger.log(`Done in ${(Date.now() - t0) / 1000}s!`);

  if (remote) {
    try {
      await sendToS3(S3, logger, remote, cacheDir);
    } catch (e) {
      logger.error(e.message);
    }
  }
};
