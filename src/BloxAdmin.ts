import EventEmitter from "EventEmitter";
import Logger from "Logger";
import { Module } from "Module";
import RemoteMessaging from "RemoteMessaging";
import { DEFAULT_CONFIG } from "consts";
import Analytics from "modules/Analytics";
import DebugUI from "modules/DebugUI";
import { Config, InitConfig } from "types";

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
  private sessionIds: Record<number, string>;
  private apiKey: string;
  private modules: Record<string, Module>;
  private randomServerId: string;

  // Modules
  public readonly analytics?: Analytics;

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
    this.randomServerId = uuid();
    this.logger = new Logger(
      "BloxAdmin",
      this.config.api.loggingLevel || Enum.AnalyticsLogLevel.Warning,
      this.config.api.loggingHandlers,
    );
    if (!this.config.api.loggingLevel && RunService.IsStudio()) {
      this.logger.info(
        `Logging level set to ${Enum.AnalyticsLogLevel.Warning} because in studio and no logging level set`,
      );
    }
    this.logger.debug("Starting");
    this.sessionIds = {};
    this.modules = {};
    this.messenger = new RemoteMessaging({
      name: "BloxAdmin",
      apiKey: this.apiKey,
      config: this.config,
      localId: this.serverId(),
      url: `${this.config.api.base}/games/${game.GameId}/servers/${this.serverId()}/messaging`,
      logger: this.logger.sub("RemoteMessaging"),
    });

    this.logger.verbose("Loading config:", tostring(this.config));

    if (RunService.IsStudio() && !this.config.api.DEBUGGING_ONLY_runInStudio) {
      this.logger.warn("Not starting BloxAdmin because in studio");
      return;
    }

    this.analytics = this.loadModule(new Analytics(this));
    this.loadModule(new DebugUI(this));

    this.messenger.on("message", (message) => {
      this.logger.info(`Received message: ${message}`);
    });

    // Call start on next clock cycle
    delay(0, () => {
      this.start();
    });
  }

  public serverId() {
    return game.JobId || this.randomServerId;
  }

  start() {
    // eslint-disable-next-line roblox-ts/no-array-pairs
    for (const [, mod] of pairs(this.modules)) {
      mod.logger.debug("Enabled");
      this.modules[mod.name].enable();
    }

    this.messenger.connectEmitter();
    this.messenger.connectRemote();

    this.logger.info("Ready");

    this.emit("ready");
  }

  getAnalytics(): Analytics {
    return this.analytics!;
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

    return this.sessionIds[playerId];
  }
}

export default function init(apiKey: string, config: InitConfig = {}) {
  try {
    const g = _G as { _BloxAdmin: BloxAdmin };
    const ba = g._BloxAdmin || new BloxAdmin(apiKey, config);
    g._BloxAdmin = ba;

    return ba;
  } catch (e) {
    // Do nothing
  }
}
