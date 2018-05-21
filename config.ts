import { join, dirname } from "path";

export const defaultCachePath = join(dirname(process.cwd()), ".nmcache");
