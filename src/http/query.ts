import { Request } from "express";
import { ParsedQs } from "qs";
import { validRange } from "semver";
import {
  BadRequestError,
  UnsupportedChannelError,
  UnsupportedPlatformError,
  UnsupportedTagError,
} from "../errors";
import { isPlatform, Platform } from "../utils/platforms";
import {
  SupportedFileExtension,
  isSupportedFileExtension,
} from "../utils/SupportedFileExtension";

export type ReqQueryValue =
  string | ParsedQs | (string | ParsedQs)[] | string[] | ParsedQs[] | undefined;

/** single-segment route params are strings; anything else is treated as absent */
export function getStringParam(req: Request, name: string): string | undefined {
  const value = req.params[name];
  return typeof value === "string" ? value : undefined;
}

export function validateReqQueryChannel(channel: ReqQueryValue): string {
  if (typeof channel !== "string") {
    throw new UnsupportedChannelError(channel);
  }
  return channel;
}

export function validateReqQueryPlatform(platform: ReqQueryValue): Platform {
  if (!isPlatform(platform)) throw new UnsupportedPlatformError(platform);
  return platform;
}

export function validateReqQueryTag(tag?: ReqQueryValue): string | undefined {
  if (tag == undefined) return;
  if (typeof tag !== "string") {
    throw new UnsupportedTagError(tag);
  }
  // 'latest' is a pecans keyword, everything else must be a semver range
  if (tag !== "latest" && !validRange(tag)) {
    throw new UnsupportedTagError(tag);
  }
  return tag;
}

// return a string value from the req.query if it is a single string,
// otherwise return undefined
export function getStringValueFromRequestQuery(
  query: ParsedQs,
  param: string,
): string | undefined {
  if (!query[param]) return undefined;
  const value = query[param];
  return typeof value === "string" ? value : undefined;
}

export function getVersionFromQuery(query: ParsedQs): string | undefined {
  const value = getStringValueFromRequestQuery(query, "version");
  return value && (validRange(value) || value == "latest") ? value : undefined;
}

export function getFilenameFromQuery(query: ParsedQs): string | undefined {
  return getStringValueFromRequestQuery(query, "filename");
}

export function getFiletypeFromQuery(
  query: ParsedQs,
): SupportedFileExtension | undefined {
  const value = getStringValueFromRequestQuery(query, "filetype");
  if (!value) return undefined;
  const ext = value.startsWith(".") ? value : `.${value}`;
  if (!isSupportedFileExtension(ext))
    throw new BadRequestError(`Unsupported filetype requested (${value})`);
  return ext;
}

export function getPlatformFromQuery(query: ParsedQs): Platform | undefined {
  const value = getStringValueFromRequestQuery(query, "platform");
  return value && isPlatform(value) ? value : undefined;
}
