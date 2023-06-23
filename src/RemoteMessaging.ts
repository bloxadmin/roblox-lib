import EventEmitter from "EventEmitter";
import Logger from "Logger";
import { BLOXADMIN_VERSION } from "consts";
import { Config } from "types";

const HttpService = game.GetService("HttpService");
const RunService = game.GetService("RunService");
const MessagingService = game.GetService("MessagingService");

const MIN_ROBLOX_WAIT = 0.029;
interface RemoteOptions {
  url: string;
  config: {
    events: Config['events'];
    intervals: Config['intervals'];
  },
  options: {
    [key: string]: unknown;
  };
}

type RemoteResponse = [boolean, string | undefined];

export default class RemoteMessaging<M extends defined> extends EventEmitter<{
  message: [M];
  global: [M];
  local: [M];
  connect: [];
}> {
  public readonly name: string;
  public readonly localId: string;
  public readonly runMode: string;
  public url: string;
  private apiKey?: string;
  public config: Config;
  public readonly logger?: Logger;

  private remoteOptions?: RemoteOptions;
  private remoteOptionsResolvers: Array<(options: RemoteOptions) => void> = [];
  private remoteAuthListener?: RBXScriptConnection;

  private listeningRemote = false;

  private readonly localQueue: M[];

  constructor({
    name,
    localId,
    url,
    config,
    logger,
  }: {
    name: string;
    url: string;
    localId: string;
    config: Config;
    logger: Logger;
  }) {
    super();

    this.name = name;
    this.localId = localId;
    this.url = url;
    this.config = config;
    this.logger = logger;
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
      [result] = await this.flush();
      count++;
    }
  }

  public async sendRemote(message: M, priority = 0, expiresIn = 3600) {
    this.sendRemoteLocal(message);
    // this.logger?.verbose("Sending remote message:", HttpService.JSONEncode(message));

    // const size = HttpService.JSONEncode(message).size();
    // if (size > 9000) {
    //   error(`Message size is too large. ${size} > 9000`);
    // }

    // if (!message) return;

    // await this.queues.remote.add([this.localId, message as M], expiresIn, priority);
    // memoryQuotaUsage++;
  }

  public async sendRemoteLocal(message: M) {
    this.logger?.verbose("Sending remote-local message:", HttpService.JSONEncode(message));

    const size = HttpService.JSONEncode(message).size();
    if (size > 9000) {
      error(`Message size is too large. ${size} > 9000`);
    }

    if (!message) return;
    this.localQueue.push(message);
  }

  public async waitForRemoteOptions(): Promise<RemoteOptions> {
    if (this.remoteOptions) return this.remoteOptions;
    return new Promise((resolve) => {
      this.remoteOptionsResolvers.push(resolve);
    });
  }

  private reqHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "x-roblox-mode": this.runMode,
      "x-bloxadmin-version": tostring(BLOXADMIN_VERSION),
    };
  }

  public fetchRemoteOptions(): RemoteOptions | undefined {
    this.logger?.sub("fetchRemoteOptions()").debug(`GETTING FROM "${this.url}"`);
    const result = pcall<[], RequestAsyncResponse>(() => {
      return HttpService.RequestAsync({
        Method: "GET",
        Headers: this.reqHeaders(),
        Url: this.url,
      });
    });

    if (!result[0]) {
      this.logger?.sub("fetchRemoteOptions()").debug(`HTTP Request failed ${this.url}: ${tostring(result[1])}`);
      return undefined;
    }

    const [_, response] = result as LuaTuple<[boolean, RequestAsyncResponse]>;

    this.logger?.verbose("Fetched remote options", `${response.Body}`);

    if (response.StatusCode !== 200) {
      return undefined;
    }

    const options = HttpService.JSONDecode(response.Body) as RemoteOptions;

    if (options) {
      this.remoteOptionsResolvers.forEach((resolve) => resolve(options));
      this.remoteOptionsResolvers = [];
      this.logger?.sub("fetchRemoteOptions()").debug("RESOLVED");
    }

    return options;
  }

  async flush(): Promise<[number, boolean]> {
    if (!this.remoteOptions) {
      const options = this.fetchRemoteOptions();

      if (!options) {
        error(`Failed to fetch remote options for remote messaging (${this.url}): ${this.name}`);
      }

      this.remoteOptions = options;
    }

    if (this.localQueue.size() === 0) {
      return [0, true];
    }

    const messages: [0, M][] = [];

    while (messages.size() < 100) {
      const message = this.localQueue.shift();
      if (!message) break;
      messages.push([0, message]);
    }

    if (!messages || messages.size() === 0) {
      return [0, true];
    }

    this.logger?.verbose("Sending remote messages:", HttpService.JSONEncode(messages));

    const postBody = {
      messages,
    };

    const remoteResult = pcall<[], RequestAsyncResponse>(() => {
      return HttpService.RequestAsync({
        Method: "POST",
        Headers: this.reqHeaders(),
        Url: `${this.remoteOptions!.url}`,
        Body: HttpService.JSONEncode(postBody),
      });
    });

    // Posting messages to remote failed
    if (!remoteResult[0]) {
      error("Failed to post messages to remote: request failed");
    }

    const [__, response] = remoteResult as LuaTuple<[boolean, RequestAsyncResponse]>;

    if (response.StatusCode !== 200) {
      error("Failed to post messages to remote: invalid response");
    }

    const [success, newUrl] = HttpService.JSONDecode(response.Body) as RemoteResponse;

    if (newUrl) {
      this.remoteOptions.url = newUrl;
    }

    if (!success) {
      const readd = messages.map((m) => m[1]);

      for (let i = readd.size() - 1; i >= 0; i--) {
        this.localQueue.unshift(readd[i]);
      }
    }

    return [postBody.messages.size(), success];
  }


  public connectRemote() {
    MessagingService.SubscribeAsync(`bloxadmin`, ({ Data }) => {
      const [server, messages] = HttpService.JSONDecode(Data as string) as [string, M[]];

      if (server !== this.localId) {
        return;
      }

      this.logger?.debug("Received remote message via messaging service:", HttpService.JSONEncode(messages));

      messages.forEach((m) => {
        const result = this.emit("message", m) && this.emit("local", m);

        if (!result) {
          this.logger?.warn("Unhandled remote message:", HttpService.JSONEncode(m));
        }
      });
    });
  }

  public start(apiKey: string) {
    this.apiKey = apiKey;

    if (this.listeningRemote) {
      this.logger?.warn("Already flushing to remote");
      return;
    }

    this.logger?.debug("Connecting to remote");
    this.listeningRemote = true;

    this.flushLoop();
  }

  private flushLoop() {
    this.logger?.debug(">>>>>>>> Starting flush loop");

    spawn(async () => {
      while (this.listeningRemote) {
        const startAt = time();
        let toWait = this.config.intervals.ingest;
        try {
          const [count, success] = await this.flush();
          const took = time() - startAt;

          if (!success) {
            toWait = this.config.intervals.ingestRetry - took;
            this.logger?.verbose(`Ingest FAILED taking ${took} seconds, waiting ${toWait} seconds`);
          } else if (count === 0) {
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
