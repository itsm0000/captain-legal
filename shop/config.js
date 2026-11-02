// @ts-check
/**
 * Where متجر كابتن talks to, and how to reach a person. Both values are public by design, as in
 * apps/mobile/lib/server/config.ts: the project's address and its publishable key, which only
 * identifies the caller. There is no secret on this page, and none may ever be added here.
 *
 * This file names the live project. The Content-Security-Policy in index.html names the same
 * address; scripts/legal-site.mjs checks that the two agree, and --backend test rewrites both.
 */
export const BACKEND = Object.freeze({
  url: "https://nzkbhyhmsscvvqhqdsdg.supabase.co",
  key: "sb_publishable_GmAUAD5k5AD3gExaKqfW-Q_PNRVX2kF",
});

export const CONTACT = "captainappofficial@gmail.com";
