#!/usr/bin/env node

import * as program from "commander";
const config = require("./package.json");
import main from "./fetch-nm";
import * as AWS from "aws-sdk";

program
  .version(config.version)
  .usage("[...options]")
  .description(
    "A tool to get archived node modules and put them back in your monorepo to save yarn time"
  )
  .option(
    "-m --mono <path>",
    "path to mono repo config such as lerna.json to find where the packages are that need node modules"
  )
  .option("-c --cache <path>", "path to local dir to try for the node_modules")
  .option("-r --remote <string>", "the S3 bucket to try for cached artifacts")
  .option("-v --verbose", "whether to log out everything or not")
  .parse(process.argv);

const { mono, cache, remote, verbose } = program;

main(process.cwd(), {
  S3: AWS.S3,
  remote,
  cache,
  monoConfigPath: mono,
  isVerbose: !!verbose
});
