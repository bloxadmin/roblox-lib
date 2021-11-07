import Logger from "Logger";
import { Config } from "types";
const HttpService = game.GetService("HttpService");

function uuid() {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return string.gsub(template, "[xy]", (c) => {
    const v = (c === "x" && math.random(8, 0xf)) || math.random(8, 0xb);
    return string.format("%x", v);
  })[0];
}

interface Event {
  event: string;
  data: unknown;
}

export default class Transport {
  private logger: Logger;
  private host: string;
  private secure: boolean;
  private path: string;
  private apiKey: string;
  private writeBuffer: Event[] = [];
  private closed = false;
  private version: number;

  constructor(version: number, logger: Logger, config: Config, apiKey: string) {
    this.logger = logger;
    this.apiKey = apiKey;
    this.version = version;

    const uri = config.api.base;

    if (uri) {
      const schema = tostring(uri.match("^(%w+)://")[0]) || "localhost";
      const host = tostring(uri.gsub("^%w+://", "")[0].match("^([%w%.-]+:?%d*)")[0]) || "http";

      this.host = host;
      this.secure = schema === "https" || schema === "wss";
    } else {
      this.host = "localhost";
      this.secure = false;
    }

    const serverId = game.JobId || uuid();

    this.path = `/${game.GameId}/${game.PlaceId}/${serverId}`;
  }

  url() {
    return `http${this.secure ? "s" : ""}://${this.host}${this.path}`;
  }

  send(event: string, data: unknown) {
    if (this.closed) return;
    this.writeBuffer.push({ event, data });
  }

  flushIn(sec: number) {
    delay(sec, () => {
      this.flush();
    });
  }

  syncFlush(): number {
    const events = [...this.writeBuffer];
    this.writeBuffer = [];

    const data = HttpService.JSONEncode(events);

    const [success, resOrErr] = pcall(() =>
      HttpService.RequestAsync({
        Method: "POST",
        Url: this.url(),
        Body: data,
        Headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-BloxAdmin-Version": `${this.version}`,
        },
      }),
    );

    if (!success) {
      this.logger.error(resOrErr as string);
    }

    const res = resOrErr as RequestAsyncResponse;

    const fail = !success || !res.Success || res.StatusCode >= 400;
    const sendIn = fail ? 5 : 1;

    if (fail) {
      this.logger.warn((success && res.Body) || "Failed to send events");
      events.forEach((event) => this.writeBuffer.push(event));
    }

    if (!success)
      if (res.StatusCode === 401 || res.StatusCode === 403) {
        this.logger.error("API key is invalid");
        this.closed = true;
        return 3600;
      }

    return sendIn;
  }

  flush() {
    if (this.writeBuffer.size() === 0) return this.flushIn(1);

    spawn(() => {
      this.flushIn(this.syncFlush());
    });
  }
}
