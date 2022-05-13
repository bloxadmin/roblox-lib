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
    this.socket = new Transport(BLOXADMIN_VERSION, this.logger.sub("Transport"), this.config, this.apiKey);

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
}

export default function init(apiKey: string, config: InitConfig = {}) {
  const g = _G as { _BloxAdmin: BloxAdmin };
  g._BloxAdmin = g._BloxAdmin || new BloxAdmin(apiKey, config);

  return g._BloxAdmin;
}
