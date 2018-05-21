import * as AWS from "aws-sdk";
import { BucketName } from "aws-sdk/clients/s3";
import * as crypto from "crypto";
import { readdir, mkdir, readFile } from "fs-extra";
import * as glob from "glob";
import * as hashFiles from "hash-files";
import * as path from "path";
import { defaultCachePath } from "./config";
import Logger from "./logger";
import { Dir, FilePath, Bins, Deps, MonoConfig } from "./typings";

export const getCompressedName = (pathWithoutExtension: string) =>
  `${pathWithoutExtension}.tar.xz`;

export const getIdFromCompressedName = (name: string) => {
  const tar = path.parse(name).name;

  return path.parse(tar).name;
};

export const makeCacheDir = async (logger: Logger, cacheDir: Dir) => {
  if (cacheDir) {
    return cacheDir;
  }

  logger.warn(`No cache destination, using ${defaultCachePath}`);

  try {
    await mkdir(defaultCachePath);
  } catch (e) {
    if (e.code !== "EEXIST") {
      throw new Error(e);
    }
  }

  return defaultCachePath;
};

export const getYarnLockId = (cwd: Dir) =>
  new Promise<string>((res, rej) => {
    hashFiles(
      {
        files: [path.join(cwd, "yarn.lock")],
        noGlob: true
      },
      (err: Error, hash: string) => {
        if (err) {
          return rej(err);
        }

        return res(hash);
      }
    );
  });

export const arrToMap = <T>(arr: T[], getKey: (t: T) => string) =>
  arr.reduce((m, item, indx) => ({ ...m, [getKey(item)]: arr[indx] }), {});

export const getBins = async (cwd: Dir) => {
  try {
    const bins = await readdir(path.join(cwd, "/node_modules/.bin"));

    return arrToMap(bins, x => x);
  } catch (e) {
    return {};
  }
};

export const getMonoConfig = (cwd: Dir, configPath: FilePath) => {
  if (configPath) {
    return require(path.join(cwd, configPath));
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(path.join(cwd, "lerna.json"));
};

export const getMonoFiles = (cwd: Dir, monoPkgPath: FilePath) =>
  new Promise<string[]>((res, rej) => {
    glob(
      `${monoPkgPath}/*package.json`,
      {
        cwd
      },
      (err, files) => {
        if (err) {
          return rej(err.message);
        }

        return res(files);
      }
    );
  });

const applyToMonoPkg = async (
  cwd: Dir,
  monoPkgPath: FilePath,
  pred: (pjPath: string) => void
) => {
  const files = await getMonoFiles(cwd, monoPkgPath);

  for (let i = 0; i < files.length; i++) {
    await pred(files[i]);
  }
};

export const applyToMonoPkgs = async (
  cwd: Dir,
  monoConfig: MonoConfig,
  pred: (pjPath: string) => void
) => {
  for (let i = 0; i < monoConfig.packages.length; i++) {
    await applyToMonoPkg(cwd, monoConfig.packages[i], pred);
  }
};

export const makeBinDepKey = (bins: Bins, deps: Deps) => {
  if (!deps) {
    return null;
  }

  const binDeps = deps
    ? Object.keys(deps)
        .filter(dep => {
          if (dep === "flow-bin") {
            return "flow";
          }

          return bins[dep];
        })
        .map(dep => `${dep}@${deps[dep]}`)
    : [];

  if (binDeps.length === 0) {
    return null;
  }

  return crypto.createHmac("sha256", binDeps.join("")).digest("hex");
};

export const getS3 = (S3: typeof AWS.S3, Bucket: BucketName) =>
  new S3({
    apiVersion: "2006-03-01",
    params: { Bucket }
  });

export const uploadToS3 = async (
  s3: AWS.S3,
  Bucket: BucketName,
  Key: string,
  data: Buffer
) =>
  new Promise((res, rej) => {
    s3.upload(
      {
        Bucket,
        Key,
        Body: Buffer.from(data)
      },
      (err, result) => {
        if (err) {
          return rej(err);
        }

        return res(result);
      }
    );
  });

export const getUploadedTars = (s3: AWS.S3) =>
  new Promise<AWS.S3.Object[]>((res, rej) =>
    s3.listObjects((err, data) => {
      if (err) {
        return rej(err);
      }

      return res(data.Contents);
    })
  );

export const sendToS3 = async (
  S3: typeof AWS.S3,
  logger: Logger,
  bucketName: BucketName,
  cacheDir: Dir
) => {
  const s3 = getS3(S3, bucketName);
  const uploadedTars = await getUploadedTars(s3);
  const keys = arrToMap(uploadedTars, ({ Key }: { Key: string }) =>
    getCompressedName(Key)
  );
  const cachedTars = await readdir(cacheDir);
  const newTars = cachedTars.filter((cachedTar: string) => !keys[cachedTar]);

  if (newTars.length === 0) {
    return;
  }

  logger.log(`Uploading ${newTars.length} new tars`);
  logger.info(newTars.toString());

  for (let i = 0; i < newTars.length; i++) {
    const data = await readFile(path.join(cacheDir, newTars[i]));

    const result = await uploadToS3(
      s3,
      bucketName,
      getIdFromCompressedName(newTars[i]),
      data
    );

    logger.info(JSON.stringify(result));
  }

  logger.log("Uploaded new caches");
};

export const getFile = (
  s3: AWS.S3,
  Bucket: AWS.S3.BucketName,
  Key: AWS.S3.ObjectKey
): Promise<AWS.S3.Types.GetObjectOutput> =>
  new Promise((res, rej) =>
    s3.getObject({ Key, Bucket }, (err, data) => {
      if (err) {
        return rej(err);
      }

      return res(data);
    })
  );

// const syncCache = async (
//   S3: typeof AWS.S3,
//   logger: Logger,
//   remote: BucketName,
//   cacheDir: Dir
// ) => {
//   const s3 = getS3(S3, remote);
//   const uploadedTars = await getUploadedTars(s3);
//   const cachedTars = await readdir(cacheDir);
//   const keys = arrToMap(cachedTars, (x: string) => getIdFromCompressedName(x));
//   const newRemote = uploadedTars.filter(
//     ({ Key }: { Key: string }) => !keys[Key]
//   );
//
//   logger.log("Syncing remote...");
//   logger.info(`Syncing: ${JSON.stringify(newRemote)}`);
//
//   for (let i = 0; i < newRemote.length; i++) {
//     const key = newRemote[i].Key;
//     const file = await getFile(s3, remote, key);
//
//     await writeFile(path.join(cacheDir, getCompressedName(key)), file.Body);
//
//     logger.info(`${getCompressedName(key)} written to ${cacheDir}`);
//   }
//
//   logger.log("Remote synced");
// };
