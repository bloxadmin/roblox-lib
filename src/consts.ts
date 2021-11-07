import { Config } from "types";

export const BLOXADMIN_VERSION = 9;

export const DEFAULT_CONFIG: Config = {
  api: {
    DEBUGGING_ONLY_runInStudio: false,
    base: "https://injest.bloxadmin.com/",
    socketio: "/socket.io",
    loggingLevel: Enum.AnalyticsLogLevel.Warning,
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
    heartbeat: 15,
    playerCursors: 0,
    playerPositions: 0,
    stats: 15,
  },
};
