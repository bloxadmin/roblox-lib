export type AutoIntervalEvents = "stats" | "playerPosition";
export type MarketplaceEvents =
  | "marketplaceBundlePurchaseFinished"
  | "marketplaceGamePassPurchaseFinished"
  | "marketplacePremiumPurchaseFinished"
  | "marketplacePromptPurchaseFinished"
  | "marketplaceThirdPartyPurchaseFinished"
  | "marketplaceProductPurchaseFinished"
  | "processReceipt";
export type AutoPlayerEvents = MarketplaceEvents | "playerJoin" | "playerLeave" | "playerReady" | "playerChat";
export type AutoEvents =
  | AutoIntervalEvents
  | AutoPlayerEvents
  | "serverOpen"
  | "serverClose"
  | "consoleLog"
  | "scriptError"
  | "stats";
export type CustomPlayerEvents = "playerTextInput" | "playerTrigger" | "playerLocationTrigger";
export type CustomEvents = CustomPlayerEvents | "trigger" | "locationTrigger";
export type Event = AutoEvents | CustomEvents;

export interface Config {
  api: {
    base: string;
    loggingLevel: Enum.AnalyticsLogLevel;
    loggingHandlers:
      | {
          [key: string]: Enum.AnalyticsLogLevel;
        }
      | false;
    DEBUGGING_ONLY_runInStudio: boolean;
  };
  events: {
    disableIntervals: boolean;
    disablePlayer: boolean;
    disableAuto: boolean;
    disableAutoPlayer: boolean;
    disableCustomPlayer: boolean;
    disableCustom: boolean;
    disablePlayerText: boolean;
    disableText: boolean;
    disablePlayerlocation: boolean;
    disableLocation: boolean;
    disableMarketplace: boolean;
    disallow: Event[];
  };
  intervals: {
    ingest: number;
    ingestRetry: number;
    stats: number;
    heartbeat: number;
    playerPositions: number;
    playerCursors: number;
  };
}

export interface InitConfig {
  api?: Partial<Config["api"]>;
  events?: Partial<Config["events"]>;
  intervals?: Partial<Config["intervals"]>;
}

export enum EventType {
  ConsoleLog = 0,
  Analytics = 1,
  RemoteConfig = 2,
  Actions = 3,
  Moderation = 4,
  Shutdown = 5,
  Chat = 6,
}

export interface PlayerReadyData {
  input: {
    accelerometerEnabled: boolean;
    gamepadEnabled: boolean;
    gyroscopeEnabled: boolean;
    keyboardEnabled: boolean;
    mouseSensitivity: number;
    mouseEnabled: boolean;
    mouseIconEnabled: boolean;
    touchEnabled: boolean;
    vrEnabled: boolean;
  };
  settings: {
    computerCameraMovementMode: number;
    computerMovementMode: number;
    controlMode: number;
    gamepadCameraSensitivity: number;
    mouseSenitivity: number;
    savedQualityLevel: number;
    touchCameraMovementMode: number;
    touchMovementMode: number;
    inFullscreen: boolean;
    inStudio: boolean;
  };
  camera?: {
    viewportSize: [number, number];
    fov: number;
  };
  gui: {
    isTenFootInterface: boolean;
  };
}
