import * as AWS from "aws-sdk";

export interface Options {
  S3?: typeof AWS.S3;
  remote?: string;
  cache?: string;
  monoConfigPath?: string;
  isVerbose?: boolean;
}

export type Bins = {
  [name: string]: boolean;
};

export type Deps = {
  [name: string]: string;
};

export type FilePath = string;

export type Dir = string;

export type PkgVersion = string;

export type MonoConfig = {
  lerna: string,
  packages: string[],
  version?: "independent",
  useWorkspaces?: boolean
}