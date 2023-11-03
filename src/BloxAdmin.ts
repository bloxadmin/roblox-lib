const startedAt = os.clock();
const importTims: Record<string, number> = {};
let importStart = os.clock();
function importTime(name: string) {
  const took = os.clock() - importStart;
  importTims[name] = took;
  importStart = os.clock();
  return took;
}
import EventEmitter from "EventEmitter";
importTime("EventEmitter");
import Logger from "Logger";
importTime("Logger");
import { Module } from "Module";
importTime("Module");
import RemoteMessaging from "RemoteMessaging";
importTime("RemoteMessaging");
import { DEFAULT_CONFIG } from "consts";
importTime("consts");
import Actions from "modules/Actions";
importTime("Actions");
import Analytics from "modules/Analytics";
importTime("Analytics");
import DebugUI from "modules/DebugUI";
importTime("DebugUI");
import Metrics from "modules/Metrics";
importTime("Metrics");
import Moderation from "modules/Moderation";
import PromoCodes from "modules/PromoCodes";
importTime("Moderation");
import RemoteConfig from "modules/RemoteConfig";
importTime("RemoteConfig");
import Shutdown from "modules/Shutdown";
importTime("Shutdown");
import { Config, EventType, InitConfig } from "types";
importTime("types");
const importsTook = os.clock() - startedAt;

export type InitBloxAdmin = (apiKey?: string, config?: InitConfig) => BloxAdmin;

const Players = game.GetService("Players");
const StarterPlayer = game.GetService("StarterPlayer");
const HttpService = game.GetService("HttpService");
const RunService = game.GetService("RunService");

function uuid() {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return string.gsub(template, "[xy]", (c) => {
    const v = (c === "x" && math.random(8, 0xf)) || math.random(8, 0xb);
    return string.format("%x", v);
  })[0];
}

interface Services {
  Analytics: Analytics;
  DebugUI: DebugUI;
  RemoteConfig: RemoteConfig;
  Shutdown: Shutdown;
  Moderation: Moderation;
  Actions: Actions;
}

export class BloxAdmin extends EventEmitter<{ ready: [] }> {
  config: Config;
  logger: Logger;
  readonly messenger: RemoteMessaging<[EventType, ...unknown[]]>;
  eventsFolder?: Folder;
  private remoteEvents: RemoteEvent[];
  private sessionIds: Record<number, string | undefined>;
  private modules: Record<string, Module>;
  private randomServerId: string;
  private started = false;
  private enabled = false;

  constructor(config: InitConfig | undefined) {
    const setupStart = os.clock();
    super();
    if (!RunService.IsServer()) throw error("[bloxadmin] <ERROR> Can only be ran on the server", 4);

    this.config = config
      ? {
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
        moderation: {
          ...DEFAULT_CONFIG.moderation,
          ...(config.moderation || {})
        }
      }
      : DEFAULT_CONFIG;
    this.sessionIds = {};
    this.modules = {};
    this.randomServerId = uuid();
    this.remoteEvents = [];
    const configTook = os.clock() - setupStart;

    const loggerStart = os.clock();
    this.logger = new Logger(
      "bloxadmin",
      this.config.api.loggingLevel ||
      (RunService.IsStudio() ? Enum.AnalyticsLogLevel.Information : Enum.AnalyticsLogLevel.Warning),
      this.config.api.loggingHandlers,
      (message) => {
        this.GetService("DebugUI")?.Log(message);
      }
    );
    if (!this.config.api.loggingLevel && RunService.IsStudio()) {
      this.logger.info(
        `Logging level set to ${Enum.AnalyticsLogLevel.Information} because in studio and no logging level set`,
      );
    }
    this.logger.verbose(`Config took ${configTook}s`);
    this.logger.verbose(`Logger took ${os.clock() - loggerStart}s`);

    this.logger.debug("Starting");

    const messengerStart = os.clock();
    this.messenger = new RemoteMessaging({
      name: "bloxadmin",
      config: this.config,
      localId: this.serverId(),
      url: `${this.config.api.base}/games/${game.GameId}/servers/${this.serverId()}/messaging`,
      logger: this.logger.sub("RemoteMessaging"),
      updateConfig: (config) => {
        this.updateConfig(config);
      }
    });
    this.logger.verbose(`Messenger took ${os.clock() - messengerStart}s`);

    this.logger.verbose("Loading config:", tostring(this.config));

    const loadStart = os.clock();
    this.loadModule(() => new DebugUI(this));
    this.loadModule(() => new Analytics(this));
    this.loadModule(() => new RemoteConfig(this));
    this.loadModule(() => new Shutdown(this));
    this.loadModule(() => new Moderation(this));
    this.loadModule(() => new Actions(this));
    this.loadModule(() => new Metrics(this));
    this.loadModule(() => new PromoCodes(this));
    this.logger.debug(`Loaded modules in ${os.clock() - loadStart}s`);

    this.messenger.on("message", (message) => {
      this.logger.debug(`Received message: ${HttpService.JSONEncode(message)}`);
    });

    // Call start on next clock cycle
    delay(0, () => {
      this.enable();
    });
  }

  public serverId() {
    return game.JobId || this.randomServerId;
  }

  /**
   * Marges the provided config with the current config
   */
  public updateConfig(config: InitConfig | undefined) {
    if (!config) return;

    this.config = {
      api: {
        ...this.config.api,
        ...(config.api || {}),
      },
      events: {
        ...this.config.events,
        ...(config.events || {}),
      },
      intervals: {
        ...this.config.intervals,
        ...(config.intervals || {}),
      },
      moderation: {
        ...this.config.moderation,
        ...(config.moderation || {})
      }
    };

    this.logger.updateConfig(this.config.api.loggingLevel, this.config.api.loggingHandlers);
    this.messenger.config = this.config;
    this.messenger.logger?.updateConfig(this.config.api.loggingLevel, this.config.api.loggingHandlers);

    // eslint-disable-next-line roblox-ts/no-array-pairs
    for (const [, mod] of pairs(this.modules)) {
      mod.logger.updateConfig(this.config.api.loggingLevel, this.config.api.loggingHandlers);
    }
  }

  enable() {
    if (this.enabled) return;

    this.eventsFolder = new Instance("Folder");
    this.eventsFolder.Name = "bloxadminEvents";
    this.eventsFolder.Parent = game.GetService("ReplicatedStorage");

    this.remoteEvents.forEach((remoteEvent) => {
      remoteEvent.Parent = this.eventsFolder;
    });
    this.remoteEvents = [];

    const fullStartTime = os.clock();

    if (!pcall(() => HttpService.RequestAsync({ Url: "https://example.com", Method: "GET" }))[0])
      throw error("[bloxadmin] <ERROR> HTTP Requests are not enabled");

    this.enabled = true;

    // eslint-disable-next-line roblox-ts/no-array-pairs
    for (const [, mod] of pairs(this.modules)) {
      const startTime = os.clock();
      this.modules[mod.name].enable();
      mod.logger.verbose(`Enabled in ${os.clock() - startTime}s`);
    }

    this.logger.debug(`Enabled in ${os.clock() - fullStartTime}s`);
  }

  start(apiKey: string) {
    if (this.started) return;
    this.started = true;

    this.messenger.connectRemote();
    this.messenger.start(apiKey);

    this.logger.info(`Ready in ${os.clock() - startedAt}s`);

    this.emit("ready");
  }

  GetService<T extends keyof Services>(className: T): Services[T] {
    return this.modules[className] as Services[T];
  }

  getAnalytics(): Analytics {
    return this.GetService("Analytics");
  }

  getRemoteConfig(): RemoteConfig {
    return this.GetService("RemoteConfig");
  }

  getModeration(): Moderation {
    return this.GetService("Moderation");
  }

  getActions(): Actions {
    return this.GetService("Actions");
  }

  loadModule<M extends Module>(getMod: () => M) {
    const startTime = os.clock();
    const mod = getMod();
    if (this.modules[mod.name]) {
      this.logger.warn(
        debug.traceback(
          `Module "${mod.name}" loaded more than once. The previous loaded module will be discarded, this could cause or a memory leak or duplication of data.`,
          2,
        ),
      );
    }

    mod.logger.verbose(`Loaded in ${os.clock() - startTime}s`);
    this.modules[mod.name] = mod;
    return mod;
  }

  getPlayerSessionId(playerId: number, create = true) {
    if (!this.sessionIds[playerId]) this.sessionIds[playerId] = uuid();

    return this.sessionIds[playerId]!;
  }

  endPlayerSession(playerId: number) {
    this.sessionIds[playerId] = undefined;
  }

  loadLocalScript(s?: Instance) {
    if (!s) return;

    s.Name = `bloxadmin${s.Name}`;
    s.Parent = StarterPlayer.WaitForChild("StarterPlayerScripts");

    // Give script to all players that have already joined
    Players.GetPlayers().forEach((player) => {
      const clone = s.Clone();

      clone.Parent = player.WaitForChild("PlayerGui");
    });
  }

  createEvent<C extends Callback = Callback>(name: string): RemoteEvent<C> {
    const event = new Instance("RemoteEvent");
    event.Name = name;
    if (this.eventsFolder) {
      event.Parent = this.eventsFolder;
    } else {
      this.remoteEvents.push(event);
    }

    return event;
  }

  ProcessReceipt(callback: (receipt: ReceiptInfo) => Enum.ProductPurchaseDecision) {
    return (receipt: ReceiptInfo) => {
      const decision = callback(receipt);

      try {
        this.getAnalytics()?.ProcessReceipt(receipt, decision);
      } catch (e) {
        this.logger.warn(`Error sending process recipt: ${e}`);
      }

      return decision;
    };
  }
}

export default function init(apiKey?: string, config: InitConfig = {}) {
  try {
    const g = _G as { bloxadmin: BloxAdmin };
    let ba: BloxAdmin;

    if (g.bloxadmin) {
      ba = g.bloxadmin;
      ba.logger.debug(`Updating config`);
      ba.updateConfig(config);
    } else {
      const started = os.clock();
      ba = new BloxAdmin(config);
      g.bloxadmin = ba;

      ba.logger.debug(`Initialized in ${os.clock() - started}s`);
      ba.logger.debug(`Imports in ${importsTook}s`);
      ba.logger.debug(`Loaded in ${os.clock() - startedAt}s`);
    }

    if (apiKey) {
      ba.start(apiKey);
    }

    return ba;
  } catch (e) {
    warn(debug.traceback(`[BloxAdmin] <ERROR> ${e}`));
    // Do nothing
  }
}
