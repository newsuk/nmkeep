import { test } from "ava";
import main from "./fetch-nm";
import store from "./store-nm";
import { mkdir, remove, copy, access, move, readFile } from "fs-extra";
import * as path from "path";
import * as AWS from "aws-sdk";
import { AWSError } from "aws-sdk/lib/error";
import { Request } from "aws-sdk/lib/request";

const makeRepo = async (name: string) => {
  await mkdir(name);

  await copy("test-repo", name);

  await remove(`${name}/node_modules`);
  await remove(`${name}/packages/a/node_modules`);
  await remove(`${name}/packages/b/node_modules`);
};

test("fetch modules from the local cache", async () => {
  const testRepo = "fetch-test-1";

  await makeRepo(testRepo);

  const cachePath = "fetch-cache-1";

  await mkdir(cachePath);

  await store(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  await main(path.join(process.cwd(), testRepo), {
    cache: `./${cachePath}`
  });

  await access(`${testRepo}/node_modules/.bin/cli`);
  await access(`${testRepo}/node_modules/main/index.js`);
  await access(`${testRepo}/node_modules/main/package.json`);

  await remove(cachePath);

  await remove(testRepo);
});

test("fetch unhoisted from the local cache", async () => {
  const testRepo = "fetch-test-2";

  await makeRepo(testRepo);

  const cachePath = "fetch-cache-2";

  await mkdir(cachePath);

  await store(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  await main(path.join(process.cwd(), testRepo), {
    cache: `./${cachePath}`
  });

  await access(`${testRepo}/packages/a/node_modules/unhoisted/package.json`);

  await remove(cachePath);

  await remove(testRepo);
});

test("fetch bins from the local cache", async () => {
  const testRepo = "fetch-test-3";

  await makeRepo(testRepo);

  const cachePath = "fetch-cache-3";

  await mkdir(cachePath);

  await store(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  await main(path.join(process.cwd(), testRepo), {
    cache: `./${cachePath}`
  });

  await access(`${testRepo}/packages/b/node_modules/.bin/cli`);

  await remove(cachePath);

  await remove(testRepo);
});

test("add files from S3 not in cache", async t => {
  const testRepo = "fetch-test-4";

  await makeRepo(testRepo);

  const cachePath = "fetch-cache-4";

  await mkdir(cachePath);

  await store(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  const s3Cache = "s3-cache-4";

  await mkdir(s3Cache);

  await move(
    path.join(cachePath, "475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz"),
    path.join(s3Cache, "475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz")
  );

  const remote = "some-bucket";

  class S3 extends AWS.S3 {
    constructor(options?: AWS.S3.Types.ClientConfiguration) {
      super(options);

      const { apiVersion, params } = options;

      t.is(apiVersion, "2006-03-01");
      t.deepEqual(params, { Bucket: remote });

      return null;
    }

    getObject(...args): Request<AWS.S3.Types.GetObjectOutput, AWSError> {
      const [{ Key, Bucket }, cb] = args;

      t.is(Bucket.toString(), remote);

      readFile(path.join(s3Cache, `${Key}.tar.xz`))
        .then(file =>
          cb(null, {
            Body: file
          })
        )
        .catch(err => cb(err));

      return null;
    }
  }

  await main(path.join(process.cwd(), testRepo), {
    cache: `./${cachePath}`,
    S3,
    remote
  });

  await access(`${cachePath}/475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz`);

  await remove(cachePath);

  await remove(testRepo);

  await remove(s3Cache);
});

test("only add files from S3 that are needed", async t => {
  const testRepo = "fetch-test-5";

  await makeRepo(testRepo);

  const cachePath = "fetch-cache-5";

  await mkdir(cachePath);

  await store(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  const s3Cache = "s3-cache-5";

  await mkdir(s3Cache);

  await move(
    path.join(cachePath, "475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz"),
    path.join(s3Cache, "475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz")
  );

  await copy(
    path.join(s3Cache, "475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz"),
    path.join(s3Cache, "extra-file.tar.xz")
  );

  const remote = "some-bucket";

  class S3 extends AWS.S3 {
    constructor(options?: AWS.S3.Types.ClientConfiguration) {
      super(options);

      const { apiVersion, params } = options;

      t.is(apiVersion, "2006-03-01");
      t.deepEqual(params, { Bucket: remote });

      return null;
    }

    getObject(...args): Request<AWS.S3.Types.GetObjectOutput, AWSError> {
      const [{ Key }, cb] = args;

      readFile(path.join(s3Cache, `${Key}.tar.xz`))
        .then(file =>
          cb(null, {
            Body: file
          })
        )
        .catch(err => cb(err));

      return null;
    }
  }

  await main(path.join(process.cwd(), testRepo), {
    cache: `./${cachePath}`,
    S3,
    remote
  });

  t.throws(async () => await access(`${cachePath}/extra-file.tar.xz`));

  await remove(cachePath);

  await remove(testRepo);

  await remove(s3Cache);
});
