# @thetimes/nmkeep

A CLI tool to make "yarning" faster especially for a monorepo using
yarn workspaces on a slower CI machine.

## nmstore

This command tars and compresses all `node_modules` in the repo and puts
them in either the default `.nmcache` or the given path. If an S3 bucket
is provided with valid AWS credentials they'll also be sent there.

### usage

Simple example which caches the repo's `node_modules` and sends them
to an S3 bucket called `some-bucket`.

```
AWS_ACCESS_KEY_ID=SOME_KEY
AWS_SECRET_ACCESS_KEY=SOME_SECRET
nmstore -r "some-bucket"
```

#### options

`-m --mono <path>`: path to mono repo config such as `lerna.json` to
find where the packages are that need caching. Is relative to the `cwd`

`-c --cache <path>`: path to local directory for caching the
`node_modules`

`-r --remote <string>`: the S3 bucket to send the local cache to

`-v --verbose`: whether to log out everything or not

## nmfetch

This command fetches all compressed files from either the local cache
or tries S3 if it doesn't exist and the correct settings for a bucket
have been provided.

### usage

Simple example which fetches the repo's `node_modules` from either
the local cache or S3.

```
AWS_ACCESS_KEY_ID=SOME_KEY
AWS_SECRET_ACCESS_KEY=SOME_SECRET
nmfetch -r "some-bucket"
```

#### options

`-m --mono <path>`: path to mono repo config such as `lerna.json` to
find where the packages are that need `node_modules`.

`-c --cache <path>`: path to local directory to try for the
`node_modules`.

`-r --remote <string>`: the S3 bucket to try for cached artifacts

`-v --verbose`: whether to log out everything or not
