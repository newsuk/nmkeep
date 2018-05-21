import { test } from "ava";
import main from "./store-nm";
import { mkdir, access, writeFile, remove } from "fs-extra";
import * as path from "path";
import * as AWS from "aws-sdk";

test("cache the repo node_modules with the correct id", async () => {
  const cachePath = "test-cache-1";

  await mkdir(cachePath);

  await main(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  await access(`${cachePath}/475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz`);

  await remove(cachePath);
});

test("cache unhoisted modules", async () => {
  const cachePath = "test-cache-2";

  await mkdir(cachePath);

  await main(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  await access(`${cachePath}/a@1.0.0.tar.xz`);

  await remove(cachePath);
});

test("cache with just bin modules", async () => {
  const cachePath = "test-cache-3";

  await mkdir(cachePath);

  await main(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  await access(
    `${cachePath}/f1aa613d804250507ed5d421bf5c6bf07083977ef8afe0e23241d33be69727ff.tar.xz`
  );

  await remove(cachePath);
});

test("do nothing if file exists in the cache", async () => {
  const cachePath = "test-cache-4";

  await mkdir(cachePath);

  await writeFile(
    `${cachePath}/475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz`,
    null
  );

  await access(`${cachePath}/475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz`);

  await main(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`
  });

  await access(`${cachePath}/475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz`);

  await remove(cachePath);
});

test("upload cached files not on S3", async t => {
  const cachePath = "test-cache-5";
  const Bucket = "some-bucket";

  class S3 extends AWS.S3 {
    constructor(options?: AWS.S3.Types.ClientConfiguration) {
      super(options);

      const { apiVersion, params } = options;

      t.is(apiVersion, "2006-03-01");
      t.deepEqual(params, { Bucket });
    }

    listObjects(...args) {
      const [cb] = args;

      cb(null, {
        Contents: [
          {
            Key: "475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd"
          },
          // {
          //   Key: "a@1.0.0"
          // },
          {
            Key:
              "f1aa613d804250507ed5d421bf5c6bf07083977ef8afe0e23241d33be69727ff"
          }
        ]
      });

      return null;
    }

    upload(...args) {
      const [params, cb] = args;

      t.snapshot(params);
      cb(null, {
        Location: "https:/someplace",
        ETag: "1234",
        Bucket,
        Key: params.Key
      });

      return null;
    }
  }

  await mkdir(cachePath);

  await writeFile(
    `${cachePath}/475938dffbe1e2dc4b35a2d714b2f1cf7a3d0cfd.tar.xz`,
    null
  );

  await writeFile(`${cachePath}/a@1.0.0.tar.xz`, null);

  await writeFile(
    `${cachePath}/f1aa613d804250507ed5d421bf5c6bf07083977ef8afe0e23241d33be69727ff.tar.xz`,
    null
  );

  await main(path.join(process.cwd(), "test-repo"), {
    cache: `./${cachePath}`,
    remote: Bucket,
    S3
  });

  await remove(cachePath);
});
