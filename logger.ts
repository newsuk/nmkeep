/* eslint-disable no-console, class-methods-use-this */

import chalk from "chalk";

interface LoggerOptions {
  isVerbose?: boolean;
}

type LogParams = string[];

export default class Logger {
  isVerbose: boolean;

  constructor({ isVerbose }: LoggerOptions) {
    this.isVerbose = isVerbose || false;
  }

  info(...params: LogParams): void;
  info(...msgs) {
    if (this.isVerbose) {
      msgs.forEach(msg => {
        console.info(chalk.blue(msg));
      });
    }
  }

  warn(...params: LogParams): void;
  warn(...msgs) {
    if (this.isVerbose) {
      msgs.forEach(msg => {
        console.info(chalk.yellow(msg));
      });
    }
  }

  log(...params: LogParams): void;
  log(...msgs) {
    msgs.forEach(msg => {
      console.info(chalk.green(msg));
    });
  }

  error(...params: LogParams): void;
  error(...msgs) {
    msgs.forEach(msg => {
      console.info(chalk.red(msg));
    });
  }
}
