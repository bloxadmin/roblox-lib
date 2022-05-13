import { Config } from "types";

export const BLOXADMIN_VERSION = 11;

export const DEFAULT_CONFIG: Config = {
  api: {
    DEBUGGING_ONLY_runInStudio: false,
    base: "https://worker.bloxadmin.com/",
    loggingLevel: Enum.AnalyticsLogLevel.Fatal,
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
    disallow: [],
  },
  intervals: {
    ingest: 15,
    ingestRetry: 7,
    heartbeat: 15,
    playerCursors: 0,
    playerPositions: 0,
    stats: 15,
  },
};
