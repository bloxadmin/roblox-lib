import { Config } from "types";

export const BLOXADMIN_VERSION = 125;

export const DEFAULT_CONFIG: Config = {
  api: {
    DEBUGGING_ONLY_runInStudio: false,
    base: "https://api.bloxadmin.com",
    loggingLevel: Enum.AnalyticsLogLevel.Fatal,
    loggingHandlers: undefined,
  },
  events: {
    disableIntervals: false,
    disablePlayer: false,
    disableAuto: false,
    disableAutoPlayer: false,
    disableCustomPlayer: false,
    disableCustom: false,
    disablePlayerText: false,
    disableText: false,
    disablePlayerlocation: false,
    disableLocation: false,
    disableMarketplace: false,
    disallow: ["scriptError"],
  },
  intervals: {
    ingest: 15,
    ingestRetry: 10,
    ingestNoopRetry: 5,
    heartbeat: 60,
    playerCursors: 0,
    playerPositions: 0,
    stats: 0,
  },
  moderation: {
    kick: true,
    mute: true,
    ban: true
  }
};
