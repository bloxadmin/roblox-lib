import EventEmitter from "EventEmitter";
import Logger from "Logger";
import { BLOXADMIN_VERSION } from "consts";
import PromiseQueue from "messaging/PromiseQueue";
import { Config } from "types";

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

enum Queue {
  Global = "global",
  Local = "local",
  Remote = "remote",
}

export default class RemoteMessaging<M = unknown> extends EventEmitter<{ message: [M]; global: [M]; connect: [] }> {
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

  private readonly listening: {
    [key in Queue]: boolean;
  } = {
    local: false,
    global: false,
    remote: false,
  };
  private readonly queues: {
    [Queue.Local]: PromiseQueue<M>;
    [Queue.Global]: PromiseQueue<M>;
    [Queue.Remote]: PromiseQueue<[string, M]>;
  };

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

    this.queues = {
      global: new PromiseQueue(`${QUEUE_PREFIX}${GLOBAL_QUEUE}.${tostring(name)}`),
      local: new PromiseQueue(`${QUEUE_PREFIX}${LOCAL_QUEUE}.${tostring(name)}.${tostring(localId)}`),
      remote: new PromiseQueue(`${QUEUE_PREFIX}${GLOBAL_REMOTE_QUEUE}.${tostring(name)}`),
    };
  }

  public setApiKey(apiKey: string) {
    this.apiKey = apiKey;
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
    while (result === 100 && count < 0) {
      result = await this.processRemoteEvents();
      count++;
    }
  }

  public async sendRemote(message: M, priority = 0, expiresIn = 3600) {
    this.logger?.verbose("Sending remote message:", HttpService.JSONEncode(message));

    const size = HttpService.JSONEncode(message).size();
    if (size > 9000) {
      error(`Message size is too large. ${size} > 9000`);
    }

    if (!message) return;

    await this.queues.remote.add([this.localId, message as M], expiresIn, priority);
  }

  public async sendLocal(message: M, id: string, priority = 0, expiresIn = 3600) {
    this.logger?.verbose("Sending local message:", HttpService.JSONEncode(message));

    if (id === this.localId) {
      await this.queues.local.add(message, expiresIn, priority);
    } else {
      const queue = new PromiseQueue(`${QUEUE_PREFIX}${LOCAL_QUEUE}.${id}`);
      await queue.add(message, expiresIn, priority);
    }
  }

  public async sendGlobal(message: M, priority = 0, expiresIn = 3600) {
    this.logger?.verbose("Sending global message", HttpService.JSONEncode(message));

    await this.queues.global.add(message, expiresIn, priority);
  }

  public readAndConsume(queue: Queue, callback: (message: M[]) => boolean, count = 1) {
    if (queue === Queue.Remote) error("Cannot read and consume remote queue", 1);

    this.logger?.verbose(`Reading and consuming ${queue} messages`);

    return this.queues[queue]
      .read(count, false, -1)
      .then(([messages, removeId]) => {
        this.logger?.verbose(`Got Message:`, HttpService.JSONEncode(messages));
        this.logger?.verbose(`Delete Id: ${removeId}`);

        const success = pcall<[M[], (message: M[]) => boolean], boolean>((m, cb) => cb(m), messages, callback);
        if (!success[0] || !success[1]) return;

        this.queues[queue].remove(removeId).catch((err) => {
          this.logger?.error("Failed to remove message from queue", err);
        });
      })
      .catch((err) => {
        this.logger?.error("Failed to read and consume message", err);
      });
  }

  public listenConsome(queue: Queue, callback: (message: M) => void | boolean) {
    this.logger?.debug(`Listening for ${queue} messages`);
    if (this.listening[queue]) error(`Already listening to ${queue}`, 1);
    this.listening[queue] = true;
    spawn(async () => {
      while (this.listening[queue]) {
        const startAt = time();
        await this.readAndConsume(queue, (messages) => {
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
        const took = time() - startAt;
        wait(math.max(0, 0.1 - took));
      }
    });
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

  async flushAndPollRemote(): Promise<[number, RemoteResponse<M>]> {
    if (!this.remoteOptions) {
      const options = this.fetchRemoteOptions();

      if (!options) {
        error(`Failed to fetch remote options for remote messaging (${this.url}): ${this.name}`);
      }

      this.remoteOptions = options;
    }

    const [messages, removeId] = await this.queues.remote.read(100, false, this.config.intervals.ingest);

    if (messages && messages.size()) {
      this.logger?.verbose("Sending remote messages:", HttpService.JSONEncode(messages));
    }

    const postBody = {
      messages: messages || [],
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

    if (removeId) {
      await this.queues.remote.remove(removeId);
    }

    const body = HttpService.JSONDecode(response.Body) as RemoteResponse<M>;

    return [postBody.messages.size(), body];
  }

  public connectLocalEmitter() {
    this.logger?.debug("Connecting local emitter");
    this.waitForRemoteOptions().then(() => {
      this.listenConsome(Queue.Local, (m) => {
        return this.emit("message", m);
      });
    });
  }

  public connectGlobalEmitter() {
    this.logger?.debug("Connecting global emitter");
    this.waitForRemoteOptions().then(() => {
      this.listenConsome(Queue.Global, (m) => {
        return this.emit("global", m);
      });
    });
  }

  public async processRemoteEvents(): Promise<number> {
    const [queueProcessed, result] = await this.flushAndPollRemote();

    if (!result.success) {
      this.logger?.warn("Ingest unsuccessful, no clue what's wrong though");
    }

    const { global, locals } = result;

    // eslint-disable-next-line roblox-ts/no-array-pairs
    for (const [key, messages] of pairs(locals)) {
      for (const message of messages) {
        this.sendLocal(message, key as string).catch((err) => {
          this.logger?.error("Failed to send local message", err);
        });
      }
    }

    for (const message of global) {
      this.sendGlobal(message).catch((err) => {
        this.logger?.error("Failed to send global message", err);
      });
    }

    return queueProcessed;
  }

  public connectRemote(apiKey: string) {
    this.apiKey = apiKey;

    this.logger?.debug("Connecting remote");

    if (this.listening.remote) error("Already listening", 1);
    this.listening.remote = true;

    this.connectRemoteLoop();
  }

  private connectRemoteLoop() {
    this.logger?.debug(">>>>>>>> Starting remote loop");

    spawn(async () => {
      while (this.listening.remote) {
        const startAt = time();
        let success = false;
        try {
          success = (await this.processRemoteEvents()) >= 0;
        } finally {
          const took = time() - startAt;
          let toWait = this.config.intervals.ingest - took;

          if (success) {
            this.logger?.verbose(`Ingest took ${took} seconds, waiting ${toWait} seconds`);
          } else {
            toWait = this.config.intervals.ingestRetry - took;
            this.logger?.verbose(`Ingest FAILED taking ${took} seconds, waiting ${toWait} seconds`);
          }

          if (toWait >= MIN_ROBLOX_WAIT) {
            wait(toWait);
          }
        }
      }
    });
  }

  public stopListening() {
    this.listening.global = false;
    this.listening.local = false;
    this.listening.remote = false;
  }
}
