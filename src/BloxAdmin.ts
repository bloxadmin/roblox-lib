import EventEmitter from "EventEmitter";
import Logger from "Logger";
import { Module } from "Module";
import RemoteMessaging from "RemoteMessaging";
import { DEFAULT_CONFIG } from "consts";
import Analytics from "modules/Analytics";
import DebugUI from "modules/DebugUI";
import RemoteConfig from "modules/RemoteConfig";
import { Config, InitConfig } from "types";

export type InitBloxAdmin = (apiKey?: string, config?: InitConfig) => BloxAdmin;

const HttpService = game.GetService("HttpService");
const RunService = game.GetService("RunService");

function uuid() {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return string.gsub(template, "[xy]", (c) => {
    const v = (c === "x" && math.random(8, 0xf)) || math.random(8, 0xb);
    return string.format("%x", v);
  })[0];
}

export class BloxAdmin extends EventEmitter<{ ready: [] }> {
  config: Config;
  logger: Logger;
  readonly messenger: RemoteMessaging<[number, ...unknown[]]>;
  readonly eventsFolder: Folder;
  private sessionIds: Record<number, string | undefined>;
  private modules: Record<string, Module>;
  private randomServerId: string;
  private started = false;
  private enabled = false;

  constructor(config: InitConfig | undefined) {
    super();
    if (!RunService.IsServer()) throw error("[BloxAdmin] <ERROR> Can only be ran on the server", 4);
    if (!pcall(() => HttpService.RequestAsync({ Url: "https://example.com", Method: "GET" }))[0])
      throw error("[BloxAdmin] <ERROR> HTTP Requests are not enabled");

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
        }
      : DEFAULT_CONFIG;
    this.sessionIds = {};
    this.modules = {};
    this.randomServerId = uuid();

    this.eventsFolder = new Instance("Folder");
    this.eventsFolder.Name = "BloxAdminEvents";
    this.eventsFolder.Parent = game.GetService("ReplicatedStorage");

    print("Events folder:", this.eventsFolder);

    this.logger = new Logger(
      "BloxAdmin",
      this.config.api.loggingLevel ||
        (RunService.IsStudio() ? Enum.AnalyticsLogLevel.Information : Enum.AnalyticsLogLevel.Warning),
      this.config.api.loggingHandlers,
    );
    if (!this.config.api.loggingLevel && RunService.IsStudio()) {
      this.logger.info(
        `Logging level set to ${Enum.AnalyticsLogLevel.Information} because in studio and no logging level set`,
      );
    }
    this.logger.debug("Starting");
    this.messenger = new RemoteMessaging({
      name: "BloxAdmin",
      config: this.config,
      localId: this.serverId(),
      url: `${this.config.api.base}/games/${game.GameId}/servers/${this.serverId()}/messaging`,
      logger: this.logger.sub("RemoteMessaging"),
    });

    this.logger.verbose("Loading config:", tostring(this.config));

    this.loadModule(new Analytics(this));
    this.loadModule(new DebugUI(this));
    this.loadModule(new RemoteConfig(this));

    this.messenger.on("message", (message) => {
      this.logger.info(`Received message: ${HttpService.JSONEncode(message)}`);
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

    this.enabled = true;

    // eslint-disable-next-line roblox-ts/no-array-pairs
    for (const [, mod] of pairs(this.modules)) {
      mod.logger.debug("Enabled");
      this.modules[mod.name].enable();
    }
  }

  start(apiKey: string) {
    this.messenger.apiKey = apiKey;

    if (this.started) return;
    this.started = true;

    this.messenger.connectEmitter();
    this.messenger.connectRemote();

    this.logger.info("Ready");

    this.emit("ready");
  }

  getAnalytics(): Analytics {
    return this.modules["Analytics"] as Analytics;
  }

  getRemoteConfig(): RemoteConfig {
    return this.modules["RemoteConfig"] as RemoteConfig;
  }

  loadModule<M extends Module>(mod: M) {
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
    return mod;
  }

  getPlayerSessionId(playerId: number, create = true) {
    if (!this.sessionIds[playerId]) this.sessionIds[playerId] = uuid();

    return this.sessionIds[playerId]!;
  }

  endPlayerSession(playerId: number) {
    this.sessionIds[playerId] = undefined;
  }
}

export default function init(apiKey?: string, config: InitConfig = {}) {
  try {
    const g = _G as { _BloxAdmin: BloxAdmin };
    let ba: BloxAdmin;

    if (g._BloxAdmin) {
      ba = g._BloxAdmin;
      ba.updateConfig(config);
    } else {
      ba = new BloxAdmin(config);
      g._BloxAdmin = ba;
    }

    if (apiKey) ba.start(apiKey);

    return ba;
  } catch (e) {
    warn(debug.traceback(`[BloxAdmin] <ERROR> ${e}`));
    // Do nothing
  }
}
