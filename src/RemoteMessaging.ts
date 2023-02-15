import EventEmitter, { Event } from "EventEmitter";
import Logger from "Logger";
import { Config } from "types";

const MemoryStoreService = game.GetService("MemoryStoreService");
const HttpService = game.GetService("HttpService");
const RunService = game.GetService("RunService");

const MIN_ROBLOX_WAIT = 0.029;
const QUEUE_PREFIX = "__remote-streaming";
const GLOBAL_QUEUE = "global";
const LOCAL_QUEUE = "local";
const GLOBAL_REMOTE_QUEUE = "remote";

interface RemoteOptions {
  url: string;
  options: {
    [key: string]: unknown;
  };
}

interface RemoteResponse<M> {
  success: boolean;
  locals: {
    [key: string]: M[];
  };
  global: M[];
}

export default class RemoteMessaging<M = unknown> extends EventEmitter<{ message: [M]; connect: [] }> {
  public readonly name: string;
  public readonly localId: string;
  public readonly runMode: string;
  public url: string;
  public apiKey?: string;
  public config: Config;
  public readonly logger?: Logger;

  private remoteOptions?: RemoteOptions;
  private remoteOptionsResolvers: Array<(options: RemoteOptions) => void> = [];

  private listeningLocal = false;
  private listeningRemote = false;
  private globalQueue: MemoryStoreQueue;
  private localQueue: MemoryStoreQueue;
  private remoteQueue: MemoryStoreQueue;

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
      RunService.IsStudio() ? "studio" : "",
      RunService.IsServer() ? "server" : "",
      RunService.IsClient() ? "client" : "",
      RunService.IsRunMode() ? "run_mode" : "",
      RunService.IsRunning() ? "running" : "",
    ]
      .filter((m) => m.size() > 1)
      .join(",");

    this.globalQueue = MemoryStoreService.GetQueue(`${QUEUE_PREFIX}${GLOBAL_QUEUE}.${tostring(name)}`);
    this.localQueue = MemoryStoreService.GetQueue(
      `${QUEUE_PREFIX}${LOCAL_QUEUE}.${tostring(name)}.${tostring(localId)}`,
    );
    this.remoteQueue = MemoryStoreService.GetQueue(`${QUEUE_PREFIX}${GLOBAL_REMOTE_QUEUE}.${tostring(name)}`);
  }

  public serverStop() {
    if (RunService.IsStudio() && !this.config.api.DEBUGGING_ONLY_runInStudio) {
      this.logger?.debug("Skipping flush on studio stop");
      return;
    }

    // Try to clear the queue when the server stops
    // Will only send a max of 1000 messages
    let result = 100;
    let count = -10;
    while (result === 100 && count < 0) {
      result = this.processRemoteEvents();
      count++;
    }
  }

  public sendRemote(message: M, priority = 0, expiresIn = 3600) {
    this.logger?.verbose("Sending remote message:", HttpService.JSONEncode(message));
    return pcall(() => {
      const size = HttpService.JSONEncode(message).size();
      if (size > 9000) {
        this.logger?.warn("Message size is too large", `${size} > 9000`);
        return false;
      }

      this.remoteQueue.AddAsync([this.localId, message], expiresIn, priority);
      return true;
    });
  }

  public sendLocal(message: M, id: string, priority = 0, expiresIn = 3600) {
    this.logger?.verbose("Sending local message:", HttpService.JSONEncode(message));
    return pcall(() => {
      if (id === this.localId) {
        this.localQueue.AddAsync(message, expiresIn, priority);
      } else {
        const queue = MemoryStoreService.GetQueue(`${QUEUE_PREFIX}${LOCAL_QUEUE}.${id}`);
        queue.AddAsync(message, expiresIn, priority);
      }
      return true;
    });
  }

  public sendGlobal(message: M, priority = 0, expiresIn = 3600) {
    this.logger?.verbose("Sending global message", HttpService.JSONEncode(message));
    return pcall(() => {
      this.globalQueue.AddAsync(message, expiresIn, priority);
      return true;
    });
  }

  public readAndConsumeLocal(callback: (message: M[]) => boolean, count = 1) {
    this.logger?.verbose("Reading and consuming local messages");
    const result = pcall<[RemoteMessaging<M>], LuaTuple<[items: M[], id: string]>>((remoteMessaging) => {
      return remoteMessaging.localQueue.ReadAsync(count, false, -1) as LuaTuple<[M[], string]>;
    }, this);
    const [readSuccess] = result;
    if (!readSuccess) return;
    const [_, messages, removeId] = result as LuaTuple<[boolean, M[], string]>;
    this.logger?.verbose(`Got Message:`, HttpService.JSONEncode(messages));
    this.logger?.verbose(`Delete Id: ${removeId}`);
    const success = pcall<[M[], (message: M[]) => boolean], boolean>((m, cb) => cb(m), messages, callback);
    if (!success[0] || !success[1]) return;
    pcall(() => {
      this.localQueue.RemoveAsync(removeId);
    });
  }

  public listenConsomeLocal(callback: (message: M) => void | boolean) {
    this.logger?.debug("Listening for local messages");
    if (this.listeningLocal) error("Already listening", 1);
    this.listeningLocal = true;
    spawn(() => {
      while (this.listeningLocal) {
        this.readAndConsumeLocal((messages) => {
          const result = pcall(() => {
            let success = true;
            for (const message of messages) {
              const r = callback(message);

              if (typeOf(r) === "boolean") {
                success = r as boolean;
              }
            }

            return true;
          });

          return result[0] && result[1];
        });
      }
    });
  }

  public async waitForRemoteOptions(): Promise<RemoteOptions> {
    if (this.remoteOptions) return this.remoteOptions;
    return new Promise((resolve) => {
      this.remoteOptionsResolvers.push(resolve);
    });
  }

  public fetchRemoteOptions(): RemoteOptions | undefined {
    this.logger?.sub("fetchRemoteOptions()").debug(`GETTING FROM "${this.url}"`);
    const result = pcall<[], RequestAsyncResponse>(() => {
      return HttpService.RequestAsync({
        Method: "GET",
        Headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "x-roblox-mode": this.runMode,
        },
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

  flushAndPollRemote(): [number, RemoteResponse<M> | undefined] {
    if (!this.remoteOptions) {
      const options = this.fetchRemoteOptions();

      if (!options) {
        this.logger?.warn(`Failed to fetch remote options for remote messaging (${this.url}): ${this.name}`);
        return [-1, undefined];
      }

      this.remoteOptions = options;
    }

    const queueResult = pcall<[RemoteMessaging<M>], LuaTuple<[items: M[], id: string]>>((remoteMessaging) => {
      // We only want to send a max of 300 events at a time as to not go over the 1MB limit
      // Each message has a max of 9.9KB
      return remoteMessaging.remoteQueue.ReadAsync(100, false, this.config.intervals.ingest) as LuaTuple<[M[], string]>;
    }, this);

    // Fetching messages from queue failed
    if (!(queueResult as LuaTuple<[boolean, unknown]>)[0]) {
      this.logger?.warn(
        `Failed to fetch messages from remote queue: ${tostring((queueResult as LuaTuple<[boolean, unknown]>)[1])}`,
      );
      return [0, undefined];
    }

    const [, messages, removeId] = queueResult as LuaTuple<[boolean, M[] | undefined, string | undefined]>;

    const postBody = {
      messages: messages || [],
    };

    const remoteResult = pcall<[], RequestAsyncResponse>(() => {
      return HttpService.RequestAsync({
        Method: "POST",
        Headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "x-roblox-mode": this.runMode,
        },
        Url: `${this.remoteOptions!.url}`,
        Body: HttpService.JSONEncode(postBody),
      });
    });

    // Posting messages to remote failed
    if (!remoteResult[0]) {
      this.logger?.warn("Failed to post messages to remote: request failed");
      return [0, undefined];
    }

    const [__, response] = remoteResult as LuaTuple<[boolean, RequestAsyncResponse]>;

    if (response.StatusCode !== 200) {
      this.logger?.warn("Failed to post messages to remote: invalid response");
      return [0, undefined];
    }

    if (removeId) {
      const success = pcall<[string, RemoteMessaging<M>], boolean>(
        (id, remoteMessaging) => {
          remoteMessaging.remoteQueue.RemoveAsync(id);
          return true;
        },
        removeId,
        this,
      );

      if (!success[0] || !success[1]) {
        this.logger?.warn(
          `Failed to remove messages from remote queue (${tostring(removeId)}): ${tostring(success[1])}`,
        );
      }
    }

    const body = HttpService.JSONDecode(response.Body) as RemoteResponse<M>;

    return [postBody.messages.size(), body];
  }

  public connectEmitter() {
    this.logger?.debug("Connecting emitter");
    this.listenConsomeLocal((m) => {
      return this.emit("message", m);
    });
  }

  public processRemoteEvents(): number {
    const [queueProcessed, result] = this.flushAndPollRemote();

    if (!result || queueProcessed === -1) {
      return -1;
    }

    if (!result.success) {
      this.logger?.warn("Ingest unsuccessful, no clue what's wrong though");
    }

    const { global, locals } = result;

    // eslint-disable-next-line roblox-ts/no-array-pairs
    for (const [key, messages] of pairs(locals)) {
      for (const message of messages) {
        this.sendLocal(message, key as string);
      }
    }

    for (const message of global) {
      this.sendGlobal(message);
    }

    return queueProcessed;
  }

  public connectRemote() {
    this.logger?.debug("Connecting remote");
    if (this.listeningRemote) error("Already listening", 1);
    this.listeningRemote = true;
    spawn(() => {
      while (this.listeningRemote) {
        const startAt = time();
        const result = this.processRemoteEvents();
        const took = time() - startAt;

        if (result === -1) {
          const toWait = this.config.intervals.ingestRetry - took;
          this.logger?.verbose(`Ingest FAILED taking ${took} seconds, waiting ${toWait} seconds`);
          if (toWait >= MIN_ROBLOX_WAIT) {
            wait(toWait);
          }

          continue;
        }

        const toWait = this.config.intervals.ingest - took;

        this.logger?.verbose(`Ingest took ${took} seconds, waiting ${toWait} seconds`);

        if (toWait >= MIN_ROBLOX_WAIT) {
          wait(toWait);
        }
      }
    });
  }

  public stopListening() {
    this.listeningLocal = false;
    this.listeningRemote = false;
  }
}
