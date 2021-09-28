import Engine from "../Engine";
import EventEmitter from "../Engine/EventEmitter";
const HttpService = game.GetService("HttpService");

export enum PacketType {
  Connect,
  Disconnect,
  Event,
  Ack,
  ConnectError,

  // Unused
  BinaryEvent,
  BinaryAck,
}

export interface Packet<D = unknown> {
  type: PacketType;
  nsp?: string;
  id?: number;
  data?: D;
}

interface PacketBinaryPlaceholder {
  _placeholder: boolean;
  num: number;
}

export class Parser {
  static messageRegex = "^([0-6])([0-9]+-)?((\\/[a-zA-Z\\/_-]+),)?([0-9]+)?([[{].+[\\]}])?";

  static encode(packet: Packet): string {
    packet.nsp = packet.nsp || "/";

    if (packet.nsp === "/" && !typeIs(packet.id, "number") && packet.data === undefined) {
      return `${packet.type}`;
    }

    return `${packet.type}${packet.nsp !== "/" ? `${packet.nsp},` : ""}${typeIs(packet.id, "number") ? packet.id : ""}${
      packet.data !== undefined ? HttpService.JSONEncode(packet.data) : ""
    }`;
  }

  static decode(str: string): Packet {
    // "0/roblox,1["message", "poop"]"
    const dataStart = str.find("[%{%[]")[0] || str.size();
    const dataEnd = (str.find("[%}%]]")[0] || str.size() - 1) + 1;
    const hasBinary = str.sub(0, dataStart).find("-")[0] !== undefined;
    const hasNsp = str.sub(0, dataStart).find(",")[0] !== undefined;

    let index = 1;

    const packetType = tonumber(str.sub(0, index)) as PacketType;
    if (packetType === undefined) {
      throw "Invalid packet type";
    }
    let nsp: Packet["nsp"] = "/";

    index++;

    if (hasBinary) {
      const binaryCountStr = str.sub(index, (str.find("-")[0] || 0) - 1);
      index += binaryCountStr.size() + 1;
    }

    if (hasNsp) {
      nsp = str.sub(index, (str.find(",")[0] || 0) - 1);
      index += nsp.size() + 1;
    }

    // if (str.sub(index, index + 1) === "/") {
    //   nsp = str.sub(index, (str.find(",")[0] || index + 1) - 1) as Packet["nsp"];
    //   index += (nsp || "").size() + 1;
    // }

    const id = tonumber(str.sub(index, dataStart - 1));
    const data: Array<unknown> = HttpService.JSONDecode(str.sub(dataStart, dataEnd) || "null");

    if (typeIs(data, "table") && (data as Array<unknown>)[0]) {
      const arrData = data as Array<string>;
      arrData.forEach((value, i) => {
        if (typeIs(value, "table") && (value as unknown as PacketBinaryPlaceholder)._placeholder) {
          // TODO: Determine correct length of binary data
          data[i] = str.byte(dataEnd + 1, str.size());
        }
      });
    }

    return {
      type: packetType,
      nsp,
      id,
      data,
    };
  }
}

export class Socket<O extends Record<string, unknown> = {}> extends EventEmitter {
  uri: string;
  path: string;
  nsp: string;
  state: "connecting" | "open" | "closed" = "connecting";
  private engine?: Engine;
  private autoOpen = true;
  private writeBuffer: Packet[] = [];
  private flushing = false;
  opts: O;

  constructor(uri: string, path: string, autoOpen: boolean, nsp: string, opts: O) {
    super();
    this.uri = uri;
    this.path = path;
    this.nsp = nsp;
    this.autoOpen = autoOpen;
    this.opts = opts;

    if (autoOpen) this.open();
  }

  open(): void {
    this.engine = new Engine(this.uri, this.path);

    this.engine.on("message", (data: string) => {
      const packet = Parser.decode(data);

      this.onPacket(packet);
    });

    this.engine.on("close", () => {
      this.engine = undefined;
      this.emit("disconnect");
      this.open();
    });

    this.sendPacket({
      type: PacketType.Connect,
      nsp: this.nsp,
      data: this.opts,
    });
  }

  onPacket(packet: Packet) {
    if (packet.type === PacketType.Connect) {
      this.state = "open";
      this.emit("connect");
      this.flush();
    } else if (packet.type === PacketType.Disconnect) {
      this.state = "closed";
      this.emit("disconnect");
    } else if (packet.type === PacketType.Event) {
      const packetData = packet.data as unknown[];
      const event = (packetData as string[]).shift() as string;
      if (event === "message") {
        this.emit(event, ...packetData);
      }
    } else if (packet.type === PacketType.ConnectError) {
      this.emit("connect_error");
    } else {
      // Ignored, unsupported packet
    }
  }

  flush(force = false) {
    if ((this.state === "open" && !this.flushing && this.writeBuffer.size() > 0) || force) {
      this.flushing = true;
      const buffer = [...this.writeBuffer];
      this.writeBuffer.clear();

      for (const packet of buffer) {
        this.sendPacket(packet);
      }

      this.flushing = false;
    }
  }

  sendPacket(packet: Packet): void {
    this.engine?.send(Parser.encode(packet));
  }

  send(channel: string, ...args: unknown[]): void {
    this.writeBuffer.push({
      type: PacketType.Event,
      nsp: this.nsp,
      data: [channel, ...args],
    });
    this.flush();
  }

  close(err = false) {
    if (!err)
      this.sendPacket({
        type: PacketType.Disconnect,
        nsp: this.nsp,
      });
    this.engine?.close(err);
  }
}

function io<O extends Record<string, unknown> = {}>(
  uri: string,
  path: string,
  autoOpen = true,
  nsp = "/",
  opts?: O,
): Socket {
  return new Socket(uri, path, autoOpen, nsp, opts || {});
}

export default io;
