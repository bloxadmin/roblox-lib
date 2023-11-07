import EventEmitter from "EventEmitter";
import Logger from "Logger";
import { BLOXADMIN_VERSION } from "consts";
import { Config, EventType, InitConfig } from "types";

const HttpService = game.GetService("HttpService");
const RunService = game.GetService("RunService");
const MessagingService = game.GetService("MessagingService");

const MIN_ROBLOX_WAIT = 0.029;
interface RemoteOptions {
  url: string;
  config: InitConfig,
  options: {
    [key: string]: unknown;
  };
}

type RemoteResponse = [boolean, string | undefined, InitConfig | undefined];

export default class RemoteMessaging<M extends defined> extends EventEmitter<{
  message: [M];
  global: [M];
  local: [M];
  connect: [];
  options: [RemoteOptions];
}> {
  public readonly name: string;
  public readonly localId: string;
  public readonly runMode: string;
  public url: string;
  private apiKey?: string;
  public config: Config;
  public readonly logger?: Logger;
  private readonly updateConfig: (config: InitConfig) => void;

  private remoteOptions?: RemoteOptions;

  private listeningRemote = false;
  private flushing = false;

  private readonly localQueue: M[];
  public connected: boolean = false;

  constructor({
    name,
    localId,
    url,
    config,
    logger,
    updateConfig,
  }: {
    name: string;
    url: string;
    localId: string;
    config: Config;
    logger: Logger;
    updateConfig: (config: InitConfig) => void;
  }) {
    super();

    this.name = name;
    this.localId = localId;
    this.url = url;
    this.config = config;
    this.logger = logger;
    this.updateConfig = updateConfig;
    this.runMode = [
      RunService.IsStudio() && !this.config.api.DEBUGGING_ONLY_runInStudio ? "studio" : "",
      RunService.IsServer() ? "server" : "",
      RunService.IsClient() ? "client" : "",
      RunService.IsRunMode() ? "run_mode" : "",
      RunService.IsRunning() ? "running" : "",
    ]
      .filter((m) => m.size() > 1)
      .join(",");

    this.localQueue = [];
  }

  public setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  public getQueueSize() {
    return this.localQueue.size();
  }

  public setOptions(options: RemoteOptions) {
    this.remoteOptions = options;
    this.emit("options", options);
  }

  public async serverStop() {
    if (RunService.IsStudio() && !this.config.api.DEBUGGING_ONLY_runInStudio) {
      this.logger?.debug("Skipping flush on studio stop");
      return;
    }

    // Try to clear the queue when the server stops
    // Will only send a max of 1000 messages
    let result = 100;
    let count = -10;
    while (result !== 0 && count < 0) {
      result = await this.flush();
      count++;
    }
  }

  public async sendRemote(message: M) {
    this.logger?.verbose("Sending remote-local message:", HttpService.JSONEncode(message));

    const size = HttpService.JSONEncode(message).size();
    if (size > 9000) {
      error(`Message size is too large. ${size} > 9000`);
    }

    if (!message) return;
    this.localQueue.push(message);
  }

  private reqHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "x-roblox-mode": this.runMode,
      "x-bloxadmin-version": tostring(BLOXADMIN_VERSION),
    };
  }


  public connectRemote() {
    MessagingService.SubscribeAsync(`bloxadmin`, ({ Data }) => {
      const [server, messages] = HttpService.JSONDecode(Data as string) as [string, M[]];

      if (server !== this.localId) {
        return;
      }

      this.logger?.debug("Received remote message via messaging service:", HttpService.JSONEncode(messages));

      messages.forEach((m) => {
        const result = this.emit("message", m) || this.emit("local", m);

        if (!result) {
          this.logger?.warn("Unhandled remote message:", HttpService.JSONEncode(m));
        }
      });
    });
  }

  public get(url: string) {
    return HttpService.RequestAsync({
      Method: "GET",
      Headers: this.reqHeaders(),
      Url: url,
    });
  }

  public post(url: string, body: unknown) {
    return HttpService.RequestAsync({
      Method: "POST",
      Headers: this.reqHeaders(),
      Url: url,
      Body: HttpService.JSONEncode(body),
    });
  }

  public put(url: string, body: unknown) {
    return HttpService.RequestAsync({
      Method: "PUT",
      Headers: this.reqHeaders(),
      Url: url,
      Body: HttpService.JSONEncode(body),
    });
  }

  public async setup(): Promise<void> {
    const result = this.get(this.url);

    if (!result) {
      error(`Failed to fetch remote options for remote messaging (${this.url}): ${this.name}`);
    }

    if (result.StatusCode >= 400 && result.StatusCode < 500) {
      warn(`[bloxadmin] Failed to fetch remote options for remote messaging: ${result.Body}`);
      error(result.Body);
    }

    if (!result.Success) {
      this.logger?.warn(`Failed to fetch remote options for remote messaging: ${result.Body}`);
      this.logger?.warn("Retrying in 3 seconds");
      delay(3, () => this.setup());
      return;
    }

    const data = HttpService.JSONDecode(result.Body) as RemoteOptions;

    this.setOptions(data);
  }

  public async start(apiKey: string) {
    this.apiKey = apiKey;

    if (this.listeningRemote) {
      this.logger?.warn("Already flushing to remote");
      return;
    }

    this.logger?.debug("Connecting to remote");

    await this.setup();

    this.emit("connect");
    this.connected = true;

    this.logger?.debug("Sending events to remote");
    this.listeningRemote = true;

    this.flushLoop();
  }

  public flush(): number {
    if (!this.remoteOptions) return 0;
    if (this.flushing) return -1;
    this.flushing = true;

    try {
      if (this.localQueue.size() === 0) {
        return 0;
      }

      const messages: M[] = [];

      while (messages.size() < 100) {
        const message = this.localQueue.shift();
        if (!message) break;
        messages.push(message);
      }

      if (!messages || messages.size() === 0) {
        return 0;
      }

      this.logger?.verbose("Sending remote messages:", HttpService.JSONEncode(messages));

      const postBody = {
        messages,
      };

      const result = this.post(this.remoteOptions.url, postBody);

      if (!result.Success) {
        throw `Failed to send remote messages: ${result.Body}`;
      }

      const data = HttpService.JSONDecode(result.Body) as {
        options?: RemoteOptions;
        retry?: M[];
        messages: M[];
      };

      if (data.options) {
        this.logger?.debug("Remote sent options:", HttpService.JSONEncode(data.options));
        this.setOptions(data.options);
      }

      if (data.retry) {
        this.logger?.debug("Remote requested retry:", HttpService.JSONEncode(data.retry));
        data.retry.forEach((m) => this.localQueue.unshift(m));
      }

      if (data.messages) {
        this.logger?.debug("Remote sent events:", tostring(data.messages.size()));

        data.messages.forEach((m) => {
          const result = this.emit("message", m) || this.emit("local", m);

          if (!result) {
            this.logger?.warn("Unhandled remote message:", HttpService.JSONEncode(m));
          }
        })
      }

      return messages.size() - (data.retry?.size() || 0);
    } catch (err) {
      throw err;
    } finally {
      this.flushing = false;
    }
  }

  private flushLoop() {
    this.logger?.debug(">>>>>>>> Starting flush loop");

    spawn(async () => {
      while (this.listeningRemote) {
        const startAt = time();
        let toWait = this.config.intervals.ingest;
        try {
          const count = await this.flush();
          const took = time() - startAt;

          if (count === 0) {
            toWait = this.config.intervals.ingestNoopRetry - took;
          } else {
            toWait = this.config.intervals.ingest - took;
            this.logger?.verbose(`Ingest took ${took} seconds, waiting ${toWait} seconds`);
          }
        } catch (err) {
          const took = time() - startAt;
          toWait = this.config.intervals.ingestRetry - took;
          this.logger?.verbose(`Ingest FAILED taking ${took} seconds, waiting ${toWait} seconds: ${err}`);
        } finally {
          if (toWait >= MIN_ROBLOX_WAIT) {
            wait(toWait);
          }
        }
      }
    });
  }

  public stopListening() {
    this.listeningRemote = false;
  }
}
