import EventEmitter from "EventEmitter";
import { Config, InitConfig } from "types";
import Logger from "Logger";
import Transport from "Transport";
import { BLOXADMIN_VERSION, DEFAULT_CONFIG } from "consts";
import { Module } from "Module";
import Analytics from "modules/Analytics";

const HttpService = game.GetService("HttpService");
const RunService = game.GetService("RunService");

function uuid() {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return string.gsub(template, "[xy]", (c) => {
    const v = (c === "x" && math.random(8, 0xf)) || math.random(8, 0xb);
    return string.format("%x", v);
  })[0];
}

export class BloxAdmin extends EventEmitter {
  config: Config;
  socket: Transport;
  logger: Logger;
  private sessionIds: Record<number, string>;
  private apiKey: string;
  private modules: Record<string, Module>;

  constructor(apiKey: string, config: InitConfig = {}) {
    super();
    if (!RunService.IsServer()) throw error("[BloxAdmin] <ERROR> Can only be ran on the server", 4);
    if (!pcall(() => HttpService.RequestAsync({ Url: "https://example.com", Method: "GET" }))[0])
      throw error("[BloxAdmin] <ERROR> HTTP Requests are not enabled");
    if (!apiKey) throw error("[BloxAdmin] <ERROR> Missing API Key", 4);

    this.apiKey = apiKey;
    this.config = {
      api: {
        ...DEFAULT_CONFIG.api,
        ...(config.api || {}),
      },
      events: {
        ...DEFAULT_CONFIG.events,
        ...(config.events || {}),
      },
      intervals: {
        ...DEFAULT_CONFIG.intervals,
        ...(config.intervals || {}),
      },
    };
    this.logger = new Logger("BloxAdmin", this.config.api.loggingLevel);
    this.logger.debug("Starting");
    this.sessionIds = {};
    this.modules = {};
    this.socket = new Transport(BLOXADMIN_VERSION, this.logger, this.config, this.apiKey);

    if (RunService.IsStudio() && !this.config.api.DEBUGGING_ONLY_runInStudio) {
      this.logger.warn("Not starting BloxAdmin because in studio");
      return;
    }

    this.loadModule(new Analytics(this));

    this.start();
  }

  start() {
    // eslint-disable-next-line roblox-ts/no-array-pairs
    for (const [, mod] of pairs(this.modules)) {
      mod.logger.debug("Enabled");
      this.modules[mod.name].enable();
    }

    this.socket.flush();

    this.logger.info("Ready");
  }

  getAnalytics(): Analytics {
    return this.modules["Analytics"] as Analytics;
  }

  loadModule(mod: Module) {
    if (this.modules[mod.name]) {
      this.logger.warn(
        debug.traceback(
          `Module "${mod.name}" loaded more than once. The previous loaded module will be discarded, this could cause or a memory leak or duplication of data.`,
          2,
        ),
      );
    }

    mod.logger.debug("Loaded");
    this.modules[mod.name] = mod;
  }

  getPlayerSessionId(playerId: number, create = true) {
    if (!this.sessionIds[playerId]) this.sessionIds[playerId] = uuid();

    return this.sessionIds[playerId];
  }

  // DEPRECATED
  private warnDeperatedAnalyticsMethod(name: string) {
    this.logger.warn(
      debug.traceback(
        `The method "BloxAdmin:${name}(...)" called from ` +
          `BloxAdmin has been deprecated and will be removed in a future version of ` +
          `the script. Use "BloxAdmin:getAnalytics():${name}(...)" instead.`,
        2,
      ),
    );
    this.getAnalytics().sendScriptErrorEvent(`[BloxAdmin] Deperated method used: ${name}`, debug.traceback(), script);
  }
  sendConsoleLogEvent(message: string, msgType: Enum.MessageType) {
    this.warnDeperatedAnalyticsMethod("sendConsoleLogEvent");
    this.getAnalytics().sendConsoleLogEvent(message, msgType);
  }
  sendScriptErrorEvent(message: string, trace: string, sk: LuaSourceContainer | undefined) {
    this.warnDeperatedAnalyticsMethod("sendScriptErrorEvent");
    this.getAnalytics().sendScriptErrorEvent(message, trace, sk);
  }
  sendPlayerJoinEvent(player: Player) {
    this.warnDeperatedAnalyticsMethod("sendPlayerJoinEvent");
    this.getAnalytics().sendPlayerJoinEvent(player);
  }
  sendPlayerLeaveEvent(player: Player) {
    this.warnDeperatedAnalyticsMethod("sendPlayerLeaveEvent");
    this.getAnalytics().sendPlayerLeaveEvent(player);
  }
  sendPlayerPositionEvent(player: Player) {
    this.warnDeperatedAnalyticsMethod("sendPlayerPositionEvent");
    this.getAnalytics().sendPlayerPositionEvent(player);
  }
  sendPlayerChatEvent(player: Player, message: string, recipient?: Player) {
    this.warnDeperatedAnalyticsMethod("sendPlayerChatEvent");
    this.getAnalytics().sendPlayerChatEvent(player, message, recipient);
  }
  sendPlayerTextInputEvent(player: Player, tag: string, text: string, meta: Record<string, unknown> = {}) {
    this.warnDeperatedAnalyticsMethod("sendPlayerTextInputEvent");
    this.getAnalytics().sendPlayerTextInputEvent(player, tag, text, meta);
  }
  sendPlayerTriggerEvent(player: Player, tag: string, meta: Record<string, unknown> = {}) {
    this.warnDeperatedAnalyticsMethod("sendPlayerTriggerEvent");
    this.getAnalytics().sendPlayerTriggerEvent(player, tag, meta);
  }
  sendTriggerEvent(tag: string, meta: Record<string, unknown> = {}) {
    this.warnDeperatedAnalyticsMethod("sendTriggerEvent");
    this.getAnalytics().sendTriggerEvent(tag, meta);
  }
  sendLocationTrigger(tag: string, location: Vector3, meta: Record<string, unknown> = {}) {
    this.warnDeperatedAnalyticsMethod("sendLocationTrigger");
    this.getAnalytics().sendLocationTrigger(tag, location, meta);
  }
  sendPlayerLocationTrigger(tag: string, player: Player, location?: Vector3, meta: Record<string, unknown> = {}) {
    this.warnDeperatedAnalyticsMethod("sendPlayerLocationTrigger");
    this.getAnalytics().sendPlayerLocationTrigger(tag, player, location, meta);
  }
  sendMarketplaceBundlePurchaseFinishedEvent(player: Player, bundleId: number, wasPurchased: boolean) {
    this.warnDeperatedAnalyticsMethod("sendMarketplaceBundlePurchaseFinishedEvent");
    this.getAnalytics().sendMarketplaceBundlePurchaseFinishedEvent(player, bundleId, wasPurchased);
  }
  sendMarketplaceGamePassPurchaseFinishedEvent(player: Player, gamePassId: number, wasPurchased: boolean) {
    this.warnDeperatedAnalyticsMethod("sendMarketplaceGamePassPurchaseFinishedEvent");
    this.getAnalytics().sendMarketplaceGamePassPurchaseFinishedEvent(player, gamePassId, wasPurchased);
  }
  sendMarketplacePremiumPurchaseFinishedEvent(player: Player, wasPurchased: boolean) {
    this.warnDeperatedAnalyticsMethod("sendMarketplacePremiumPurchaseFinishedEvent");
    this.getAnalytics().sendMarketplacePremiumPurchaseFinishedEvent(player, wasPurchased);
  }
  sendMarketplacePromptPurchaseFinishedEvent(player: Player, assetId: number, wasPurchased: boolean) {
    this.warnDeperatedAnalyticsMethod("sendMarketplacePromptPurchaseFinishedEvent");
    this.getAnalytics().sendMarketplacePromptPurchaseFinishedEvent(player, assetId, wasPurchased);
  }
  sendMarketplaceThirdPartyPurchaseFinishedEvent(
    player: Player,
    productId: number,
    receipt: string,
    wasPurchased: boolean,
  ) {
    this.warnDeperatedAnalyticsMethod("sendMarketplaceThirdPartyPurchaseFinishedEvent");
    this.getAnalytics().sendMarketplaceThirdPartyPurchaseFinishedEvent(player, productId, receipt, wasPurchased);
  }
  sendMarketplaceProductPurchaseFinishedEvent(player: Player, productId: number, wasPurchased: boolean) {
    this.warnDeperatedAnalyticsMethod("sendMarketplaceProductPurchaseFinishedEvent");
    this.getAnalytics().sendMarketplaceProductPurchaseFinishedEvent(player, productId, wasPurchased);
  }
  sendProcessReceiptEvent(receiptInfo: ReceiptInfo) {
    this.warnDeperatedAnalyticsMethod("sendProcessReceiptEvent");
    this.getAnalytics().sendProcessReceiptEvent(receiptInfo);
  }
  sendEconomyEvent(
    sender: number,
    recipient: number,
    currency: string,
    amount: number,
    item: string,
    meta: Record<string, unknown> = {},
  ) {
    this.warnDeperatedAnalyticsMethod("sendEconomyEvent");
    this.getAnalytics().sendEconomyEvent(sender, recipient, currency, amount, item, meta);
  }
  sendStatsEvent() {
    this.warnDeperatedAnalyticsMethod("sendStatsEvent");
    this.getAnalytics().sendStatsEvent();
  }
}

export default function init(apiKey: string, config: InitConfig = {}) {
  const g = _G as { _BloxAdmin: BloxAdmin };
  g._BloxAdmin = g._BloxAdmin || new BloxAdmin(apiKey, config);

  return g._BloxAdmin;
}
