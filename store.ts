#!/usr/bin/env node

const config = require("./package.json");
import * as program from "commander";
import main from "./store-nm";
import * as AWS from "aws-sdk";

const myConfig = new AWS.Config();
myConfig.update({ region: "eu-west-1" });

program
  .version(config.version)
  .usage("[...options]")
  .description(
    "A tool to save monorepo yarn time by archiving all the node modules"
  )
  .option(
    "-m --mono <path>",
    "path to mono repo config such as lerna.json to find where the packages are that need caching"
  )
  .option("-c --cache <path>", "path to local dir for caching the node_modules")
  .option("-r --remote <string>", "the S3 bucket to send the local cache to")
  .option("-v --verbose", "whether to log out everything or not")
  .parse(process.argv);

const { cache, mono, remote, verbose } = program;

main(process.cwd(), {
  S3: AWS.S3,
  remote,
  cache,
  monoConfigPath: mono,
  isVerbose: !!verbose
});
