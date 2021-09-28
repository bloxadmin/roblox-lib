import EventEmitter from "./EventEmitter";

const HttpService = game.GetService("HttpService");

export enum PacketType {
  Open = 0,
  Close = 1,
  Ping = 2,
  Pong = 3,
  Message = 4,

  // Unused
  Upgrade = 5,
  Noop = 6,
}

const PacketTypeString = {
  [PacketType.Open]: "open",
  [PacketType.Close]: "close",
  [PacketType.Ping]: "ping",
  [PacketType.Pong]: "pong",
  [PacketType.Message]: "message",
  [PacketType.Upgrade]: "upgrade",
  [PacketType.Noop]: "noop",
};

export interface Packet {
  type: PacketType;
  data?: string;
}

export class Parser {
  static seperator = "\x1e";

  static decode(data: string): Packet[] {
    return data.split(Parser.seperator).map(function (part) {
      return {
        type: tonumber(part.sub(0, 1)) as PacketType,
        data: part.sub(2),
      };
    });
  }

  static encode(packets: Packet[]): string {
    return packets.map<string>((packet) => `${packet.type}${packet.data || ""}`).join(Parser.seperator);
  }
}

export class Transport extends EventEmitter {
  host: string;
  secure: boolean;
  path: string;
  id?: string;
  private writeBuffer: Packet[] = [];
  flushing = false;
  private isOpen = false;
  private totalRequests = 0;

  constructor(host: string, secure: boolean, path: string) {
    super();
    this.host = host;
    this.secure = secure;
    this.path = path;

    this.open();
  }

  open(): void {
    this.isOpen = true;
    this.requestThrottleReset();
    this.read();
  }

  throttling(): boolean {
    return this.totalRequests >= 1;
  }

  requestThrottleReset() {
    this.totalRequests = 0;
    this.flush();

    if (this.isOpen) delay(1, () => this.requestThrottleReset());
  }

  close(): void {
    this.isOpen = false;
    this.emit("close");
    this.removeAllListeners("*");
  }

  onOpen(packet: Packet) {
    const data: { sid: string } = HttpService.JSONDecode(packet.data || "{}");

    this.isOpen = true;
    this.id = data.sid;
    this.flushing = false;
    this.flush();
    this.emit("open");
  }

  onClose(packet: Packet) {
    this.isOpen = false;
    this.emit("close");
  }

  onPing(packet: Packet) {
    this.write({ type: PacketType.Pong });
    this.emit("ping");
  }

  onMessage(packet: Packet) {
    this.emit("message", packet);
  }

  read() {
    if (!this.isOpen) return;

    spawn(() => {
      this.totalRequests++;
      const [success, response] = pcall<[], string>(() => HttpService.GetAsync(this.uri(), true));

      if (success) {
        Parser.decode(response).forEach((packet) => {
          switch (packet.type) {
            case PacketType.Open:
              this.onOpen(packet);
              break;
            case PacketType.Close:
              this.onClose(packet);
              break;
            case PacketType.Ping:
              this.onPing(packet);
              break;
            case PacketType.Pong:
              break;
            case PacketType.Message:
              this.onMessage(packet);
              break;
            default:
              this.emit("error", `Unknown packet type ${PacketTypeString[packet.type]}`);
          }

          this.emit("packet", packet);
        });
      } else {
        this.emit("error", response);
        this.id = "";
      }
      this.read();
    });
  }

  write(packet: Packet) {
    this.writeBuffer.push(packet);
    this.flush();
  }

  flush() {
    if (!this.id || this.flushing || this.writeBuffer.size() === 0 || this.throttling()) return;
    this.flushing = true;

    const buffer = [...this.writeBuffer];
    this.writeBuffer.clear();
    const payload = Parser.encode(buffer);
    spawn(() => {
      this.totalRequests++;
      const [success, response] = pcall<[], string>(() =>
        HttpService.PostAsync(this.uri(), payload, "TextPlain", false),
      );

      if (success) {
        this.flushing = false;
        this.flush();
      } else {
        for (const packet of buffer) this.writeBuffer.push(packet);
        this.emit("error", response);
        this.id = undefined;
      }
    });
  }

  uri(): string {
    const uri = `${this.secure ? "https" : "http"}://${this.host}${this.path.gsub("/$", "")[0]}/`;

    const parameters: string[] = [];
    for (const [key, value] of pairs({
      EIO: "4",
      transport: "polling",
      sid: this.id,
    }))
      parameters.push(`${key}=${value}`);

    return uri + "?" + parameters.join("&");
  }
}

export default class Engine extends EventEmitter {
  host: string;
  secure: boolean;
  path: string;
  transport?: Transport;

  constructor(uri: string, path: string) {
    super();

    if (uri) {
      const schema = tostring(uri.match("^(%w+)://")[0]) || "localhost";
      const host = tostring(uri.gsub("^%w+://", "")[0].match("^([%w%.-]+:?%d*)")[0]) || "http";

      this.host = host;
      this.secure = schema === "https" || schema === "wss";
    } else {
      this.host = "localhost";
      this.secure = false;
    }

    this.path = path;

    this.open();
  }
  open() {
    this.transport = new Transport(this.host, this.secure, this.path);

    this.transport.on("message", (packet: Packet) => {
      this.emit("message", packet.data);
    });

    this.transport.on("close", (packet: Packet) => {
      this.emit("close");
    });

    this.transport.on("error", (err: string) => {});
  }

  send(data: string) {
    this.transport?.write({
      type: PacketType.Message,
      data,
    });
  }

  close(wasError = false) {
    if (wasError) {
      this.emit("error", true);
    } else {
      this.transport?.write({ type: PacketType.Close });
      this.transport?.flush();
    }
    this.transport?.close();
  }
}
