import * as AWS from "aws-sdk";
import { BucketName } from "aws-sdk/clients/s3";
import { createReadStream } from "fs";
import { mkdir, access, writeFile } from "fs-extra";
import Logger from "./logger";
import * as lzma from "lzma-native";
import * as path from "path";
import { x as extractTar } from "tar";
import { Options, FilePath, Bins, Deps, Dir, PkgVersion } from "./typings";
import {
  applyToMonoPkgs,
  getYarnLockId,
  getMonoConfig,
  makeBinDepKey,
  getBins,
  getS3,
  getFile,
  makeCacheDir,
  getCompressedName
} from "./utils";

const extractFromTo = (src: FilePath, dest: FilePath) =>
  new Promise((res, rej) => {
    const decompressor = lzma.createDecompressor();
    const stream = createReadStream(src);
    const writer = extractTar({
      strip: 1,
      C: dest
    });

    writer.on("close", res);
    writer.on("error", rej);

    stream.pipe(decompressor).pipe(writer);
  });

const populate = async (
  logger: Logger,
  cacheDir: Dir,
  id: string,
  dest: Dir,
  s3?: AWS.S3,
  bucketName?: BucketName
) => {
  const name = getCompressedName(id);
  const cachedPath = path.join(cacheDir, name);

  try {
    await access(cachedPath);

    logger.info(`Extracting: ${cachedPath} => ${dest}`);

    await extractFromTo(cachedPath, dest);
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw new Error(e);
    }

    if (!s3 || !bucketName) {
      throw new Error("Cannot find archive");
    }

    logger.info(`Fetching ${id} from S3`);

    try {
      const file = await getFile(s3, bucketName, id);

      await writeFile(cachedPath, file.Body);

      logger.info(`${name} written to ${cacheDir}`);

      await extractFromTo(cachedPath, dest);
    } catch (e) {
      logger.info(`${id} not found in cache or S3`);
      throw new Error(e);
    }
  }
};

const makeNodeModulesDir = async (cwd: Dir) => {
  try {
    await mkdir(path.join(cwd, "node_modules"));

    return false;
  } catch (e) {
    if (e.code !== "EEXIST") {
      throw new Error(e);
    }

    return true;
  }
};

const fetchBin = async (
  logger: Logger,
  bins: Bins,
  cacheSrc: FilePath,
  deps: Deps,
  pkg: Dir,
  pkgVersion: PkgVersion,
  s3?: AWS.S3,
  bucketName?: BucketName
) => {
  const binId = makeBinDepKey(bins, deps);

  if (!binId) {
    throw new Error(`No bin could be found for ${pkgVersion}`);
  }

  try {
    logger.info(`Fetching bin cache for ${pkgVersion}`);

    await populate(
      logger,
      cacheSrc,
      binId,
      path.join(pkg, "node_modules"),
      s3,
      bucketName
    );
  } catch (e) {
    logger.error(
      `Cannot find the cache for ${pkgVersion}, you'll need to yarn`
    );
  }
};

const fetchByPackageJson = async (
  logger: Logger,
  cacheSrc: FilePath,
  bins: Bins,
  pjPath: FilePath,
  s3?: AWS.S3,
  bucketName?: BucketName
) => {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { name, version, devDependencies, dependencies } = require(pjPath);

  const pkg = path.resolve(pjPath, "../");
  const pkgVersion = `${name}@${version}`;

  logger.info(`Fetching for ${pkgVersion}`);

  const nmExists = await makeNodeModulesDir(pkg);

  if (nmExists) {
    return;
  }

  try {
    const unhoistedCache = pkgVersion.replace("/", "_");

    logger.info(`Fetching unhoisted cache for ${pkgVersion}`);

    await populate(
      logger,
      cacheSrc,
      unhoistedCache,
      path.join(pkg, "node_modules"),
      s3,
      bucketName
    );
  } catch (e) {
    logger.info("No hoisted modules, fetching bin");

    await fetchBin(
      logger,
      bins,
      cacheSrc,
      { ...devDependencies, ...dependencies },
      pkg,
      pkgVersion,
      s3,
      bucketName
    );
  }
};

export default async (
  cwd: Dir,
  { S3, remote, cache, monoConfigPath, isVerbose }: Options
) => {
  const t0 = Date.now();

  const logger = new Logger({ isVerbose });
  const cacheDir = await makeCacheDir(logger, cache);

  const nmId = await getYarnLockId(cwd);
  const nmExists = await makeNodeModulesDir(cwd);
  const s3 = remote ? getS3(S3, remote) : null;

  if (!nmExists) {
    logger.log("Extracting node_modules...");

    try {
      await populate(
        logger,
        cacheDir,
        nmId,
        path.join(cwd, "node_modules"),
        s3,
        remote
      );
    } catch (e) {
      logger.error(
        "Cannot find node_modules cache, you'll need to yarn",
        e.message
      );
    }
  }

  const monoConfig = getMonoConfig(cwd, monoConfigPath);

  if (monoConfig) {
    logger.log("Fetching mono modules");

    try {
      const bins = await getBins(cwd);

      if (!bins) {
        logger.warn("No bins found for monorepo");
      }

      await applyToMonoPkgs(
        cwd,
        monoConfig,
        async pjPath =>
          await fetchByPackageJson(
            logger,
            cacheDir,
            bins,
            path.join(cwd, pjPath),
            s3,
            remote
          )
      );
    } catch (e) {
      logger.error(e.message);
    }
  }

  logger.log(`Done in ${(Date.now() - t0) / 1000}s!`);
};
