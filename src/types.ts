export type AutoIntervalEvents = "stats" | "playerPosition";
export type MarketplaceEvents =
  | "marketplaceBundlePurchaseFinished"
  | "marketplaceGamePassPurchaseFinished"
  | "marketplacePremiumPurchaseFinished"
  | "marketplacePromptPurchaseFinished"
  | "marketplaceThirdPartyPurchaseFinished"
  | "marketplaceProductPurchaseFinished"
  | "processReceipt";
export type AutoPlayerEvents = MarketplaceEvents | "playerJoin" | "playerLeave" | "playerChat";
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
    socketio: string;
    loggingLevel: Enum.AnalyticsLogLevel;
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
