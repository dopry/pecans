import { NextFunction, Request, Response } from "express";

/**
 * Minimal User-Agent platform detection, replacing the unmaintained
 * express-useragent dependency. Pecans only ever consumed four booleans
 * from it; mobile platforms are deliberately excluded from the desktop
 * flags (iOS UAs contain "like Mac OS X", Android UAs contain "Linux").
 */
export interface UserAgentDetails {
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  isLinux64: boolean;
  source: string;
}

export function parseUserAgent(source = ""): UserAgentDetails {
  const isWindows = /windows/i.test(source);
  const isIOS = /iphone|ipad|ipod/i.test(source);
  const isAndroid = /android/i.test(source);
  const isMac =
    !isWindows && !isIOS && /macintosh|mac os x|darwin/i.test(source);
  const isLinux =
    !isWindows && !isMac && !isAndroid && /linux|x11/i.test(source);
  const isLinux64 = isLinux && /x86_64|amd64|aarch64/i.test(source);
  return { source, isMac, isWindows, isLinux, isLinux64 };
}

/** attaches req.useragent, mirroring the express-useragent middleware shape */
export function userAgentMiddleware() {
  return (
    req: Request & { useragent?: UserAgentDetails },
    res: Response,
    next: NextFunction,
  ) => {
    req.useragent = parseUserAgent(req.headers["user-agent"]);
    next();
  };
}
