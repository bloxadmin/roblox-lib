import Logger, { LoggerLevel } from "Logger";
import Transport from "Transport";
const Players = game.GetService("Players");
const HttpService = game.GetService("HttpService");
const LogService = game.GetService("LogService");
const ScriptContext = game.GetService("ScriptContext");
const StatsService = game.GetService("Stats");

const BLOXADMIN_VERSION = 5;

export type AutoIntervalEvents = "stats" | "playerPosition";
export type AutoPlayerEvents = "playerJoin" | "playerLeave" | "playerChat";
export type AutoEvents =
  | AutoIntervalEvents
  | AutoPlayerEvents
  | "serverOpen"
  | "serverClose"
  | "consoleLog"
  | "scriptError"
  | "stats";
export type CustomPlayerEvents = "playerTextInput" | "playerTrigger" | "playerLocationTrigger";
export type CustomEvents = CustomPlayerEvents | "trigger" | "locationTrigger";
export type Event = AutoEvents | CustomEvents;

export interface Config {
  api: {
    base: string;
    socketio: string;
  };
  events: {
    disableIntervals: boolean;
    disablePlayer: boolean;
    disableAuto: boolean;
    disableAutoPlayer: boolean;
    disableCustomPlayer: boolean;
    disableCustom: boolean;
    disablePlayerText: boolean;
    disableText: boolean;
    disablePlayerlocation: boolean;
    disableLocation: boolean;
    disallow: Event[];
  };
}

export interface InitConfig {
  api?: {
    base?: string;
    socketio?: string;
  };
  events?: {
    disableIntervals?: boolean;
    disablePlayer?: boolean;
    disableAuto?: boolean;
    disableAutoPlayer?: boolean;
    disableCustomPlayer?: boolean;
    disableCustom?: boolean;
    disablePlayerText?: boolean;
    disableText?: boolean;
    disablePlayerlocation?: boolean;
    disableLocation?: boolean;
    disallow?: Event[];
  };
}

export const defaultConfig: Config = {
  api: {
    base: "https://injest.bloxadmin.com/",
    socketio: "/socket.io",
  },
  events: {
    disableIntervals: false,
    disablePlayer: false,
    disableAuto: false,
    disableAutoPlayer: false,
    disableCustomPlayer: false,
    disableCustom: false,
    disablePlayerText: false,
    disableText: false,
    disablePlayerlocation: false,
    disableLocation: false,
    disallow: [],
  },
};

function uuid() {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return string.gsub(template, "[xy]", (c) => {
    const v = (c === "x" && math.random(8, 0xf)) || math.random(8, 0xb);
    return string.format("%x", v);
  })[0];
}

export class BloxAdmin {
  config: Config;
  private socket: Transport;
  private logger = new Logger("BloxAdmin", LoggerLevel.None);
  private sessionIds: Record<number, string> = {};
  private apiKey: string;
  private serverId: string;

  constructor(apiKey: string, config: InitConfig = {}) {
    if (!apiKey) error("[BloxAdmin] <ERROR> Missing API Key");

    this.serverId = game.JobId || uuid();

    this.apiKey = apiKey;
    this.config = {
      api: {
        ...defaultConfig.api,
        ...(config.api || {}),
      },
      events: {
        ...defaultConfig.events,
        ...(config.events || {}),
      },
    };
    this.socket = new Transport(BLOXADMIN_VERSION, this.logger, this.config, this.apiKey);

    this.open();
  }

  private open(): void {
    this.logger.info("Starting");
    // this.socket.on("connect", () => {
    //   this.logger.info("Connected to injestor");
    // });

    // this.socket.on("disconnect", () => {
    //   this.logger.info("Disconnected from injestor");
    // });

    // this.socket.on("error", (err) => {
    //   this.logger.error("Api Error:", err);
    // });

    this.defaultEvents();
    this.collect();

    // this.socket.open();
    this.socket.flush();
  }

  private defaultEvents() {
    game.BindToClose(() => {
      this.sendServerCloseEvent();
      // this.socket.close();
      this.socket.syncFlush();
    });

    Players.PlayerAdded.Connect((player) => {
      this.sessionIds[player.UserId] = HttpService.GenerateGUID(false);
      this.sendPlayerJoinEvent(player);

      player.Chatted.Connect((message, recipient) => {
        this.sendPlayerChatEvent(player, message, recipient);
      });
    });

    Players.PlayerRemoving.Connect((player) => this.sendPlayerLeaveEvent(player));

    LogService.MessageOut.Connect((message, msgType) => {
      this.sendConsoleLogEvent(message, msgType);
    });

    ScriptContext.Error.Connect((message, trace, sk) => {
      this.sendScriptErrorEvent(message, trace, sk);
    });

    this.sendServerOpenEvent();
  }

  private collect() {
    Players.GetPlayers().forEach((player) => {
      this.sendPlayerPositionEvent(player);
      // this.sendPlayerCursorPositionEvent(player);
    });

    this.sendStatsEvent();

    delay(5, () => this.collect());
  }

  private buildEvent<D = Record<string, unknown>>(data: D) {
    return {
      eventTime: os.time() * 1000,
      // gameId: tostring(game.GameId),
      // placeId: tostring(game.PlaceId),
      // serverId: this.serverId,
      ...data,
    };
  }

  private buildPlayerEvent<D = Record<string, unknown>>(player: Player, data: D) {
    return this.buildEvent({
      playerId: player.UserId,
      playerName: player.Name,
      sessionId: this.sessionIds[player.UserId],
      ...data,
    });
  }

  private eventDisallowed(event: Event, tags: ("intervals" | "player" | "auto" | "custom" | "text" | "location")[]) {
    if (this.config.events.disallow.includes(event)) return true;
    if (tags.includes("intervals") && this.config.events.disableIntervals) return true;
    if (tags.includes("player") && this.config.events.disablePlayer) return true;
    if (tags.includes("auto") && this.config.events.disableAuto) return true;
    if (tags.includes("custom") && this.config.events.disableCustom) return true;
    if (tags.includes("auto") && tags.includes("player") && this.config.events.disableAutoPlayer) return true;
    if (tags.includes("custom") && tags.includes("player") && this.config.events.disableCustomPlayer) return true;
    if (tags.includes("custom") && tags.includes("player") && this.config.events.disableCustomPlayer) return true;
    if (tags.includes("text") && this.config.events.disableText) return true;
    if (tags.includes("text") && tags.includes("player") && this.config.events.disablePlayerText) return true;
    if (tags.includes("location") && this.config.events.disableLocation) return true;
    if (tags.includes("location") && tags.includes("player") && this.config.events.disablePlayerlocation) return true;

    return false;
  }

  /**
   * Sends the ServerOpenEvent to the injestor.
   *
   * Is called automatically and should not be called directly.
   *
   * @tags []
   */
  private sendServerOpenEvent() {
    // This event must be allowed
    this.socket.send(
      "serverOpen",
      this.buildEvent({
        placeVersion: game.PlaceVersion,
        privateServerId: game.PrivateServerId,
        privateServerOwnerId: tostring(game.PrivateServerOwnerId),
        scriptVersion: BLOXADMIN_VERSION,
      }),
    );
  }

  /**
   * Sends the ServerCloseEvent to the injestor.
   *
   * Is called automatically and should not be called directly.
   *
   * @tags []
   */
  private sendServerCloseEvent() {
    // This event must be allowed
    this.socket.send("serverClose", this.buildEvent({}));
  }

  /**
   * Sends the ConsoleLogEvent to the injestor.
   *
   * Is called automatically and should not be called directly.
   *
   * @param message Console message
   * @param msgType Level of console message
   * @tags [auto]
   */
  sendConsoleLogEvent(message: string, msgType: Enum.MessageType) {
    if (this.eventDisallowed("consoleLog", ["auto"])) return;

    if (message.sub(0, 11) === "[BloxAdmin]") return;

    this.socket.send(
      "consoleLog",
      this.buildEvent({
        message: message,
        messageType: msgType.Name,
      }),
    );
  }

  /**
   * Sends the ScriptErrorEvent to the injestor.
   *
   * Is called automatically and should not be called directly.
   *
   * @param message Script error message
   * @param trace Stack trace
   * @param sk Script which raised the error
   * @tags [auto]
   */
  sendScriptErrorEvent(message: string, trace: string, sk: LuaSourceContainer | undefined) {
    if (this.eventDisallowed("scriptError", ["auto"])) return;

    this.socket.send(
      "scriptError",
      this.buildEvent({
        message,
        trace,
        script: sk?.GetFullName(),
      }),
    );
  }

  /**
   * Sends the PlayerJoinEvent to the injestor.
   *
   * Is called automatically and should not be called directly.
   *
   * @param player Player who joined
   * @tags [auto, player]
   */
  sendPlayerJoinEvent(player: Player) {
    if (this.eventDisallowed("playerJoin", ["auto", "player"])) return;

    const joinData = player.GetJoinData();

    this.socket.send(
      "playerJoin",
      this.buildPlayerEvent(player, {
        sourceGameId: joinData.SourceGameId !== undefined ? tostring(joinData.SourceGameId) : undefined,
        sourcePlaceId: joinData.SourcePlaceId !== undefined ? tostring(joinData.SourcePlaceId) : undefined,
        partyMembers: joinData.Members?.map((m) => tostring(m)) || [],
        teleportData: joinData.TeleportData,
      }),
    );
  }

  /**
   * Sends the PlayerLeaveEvent to the injestor.
   *
   * Is called automatically and should not be called directly.
   *
   * @param player Player who left
   * @tags [auto, player]
   */
  sendPlayerLeaveEvent(player: Player) {
    if (this.eventDisallowed("playerLeave", ["auto", "player"])) return;

    this.socket.send("playerLeave", this.buildPlayerEvent(player, { followPlayerId: 0 }));
  }

  /**
   * Sends the PlayerPositionEvent to the injestor.
   * Uses the the player's current position.
   *
   * Is called automatically and should not be called directly.
   *
   * @param player Player to send the position for
   * @tags [auto, player, intervals, location]
   */
  sendPlayerPositionEvent(player: Player) {
    if (this.eventDisallowed("playerPosition", ["auto", "player", "intervals", "location"])) return;

    const part = player.Character?.PrimaryPart;

    if (!part) return;

    const position = part.Position;
    const orientation = part.Orientation;

    this.socket.send(
      "playerPosition",
      this.buildPlayerEvent(player, {
        x: position.X,
        y: position.Y,
        z: position.Z,
        pitch: orientation.X,
        yaw: orientation.Y,
        roll: orientation.Z,
      }),
    );
  }

  /**
   * Sends the PlayerChatEvent to the injestor.
   *
   * @param player Player who send a message
   * @param message Content of the message, before being censored
   * @param recipient The player who received the message, null if sent to everyone
   * @tags [auto, player, text]
   */
  sendPlayerChatEvent(player: Player, message: string, recipient?: Player) {
    if (this.eventDisallowed("playerChat", ["auto", "player", "text"])) return;

    this.socket.send(
      "playerChat",
      this.buildPlayerEvent(player, {
        message,
        recipientId: recipient?.UserId,
      }),
    );
  }

  /**
   * Sends the PlayerTextInputEvent to the injestor.
   *
   * Use this when you want to track the input of text such as promo codes
   * or twitter codes.
   *
   * DO NOT USE FOR PPI OR OTHER PERSONAL INFO SUCH AS PASSWORDS THAT IS
   * AGAINST ROBLOX COMMUNITY GUIDELINES.
   *
   * Please check for compilance with the Roblox community guidelines and any
   * other relivent laws or policies before using this. Nothing sent through
   * this should be displayed to players or any 3rd parties.
   *
   * @param player Player who inputed the text
   * @param tag Analytics tag
   * @param text Text that was inputed
   * @param meta Additional meta data
   * @tags [auto, player, text]
   */
  sendPlayerTextInputEvent(player: Player, tag: string, text: string, meta: Record<string, unknown> = {}) {
    if (this.eventDisallowed("playerTextInput", ["custom", "player", "text"])) return;

    this.socket.send(
      "playerTextInput",
      this.buildPlayerEvent(player, {
        tag,
        text,
        meta,
      }),
    );
  }

  /**
   * Sends the PlayerTriggerEvent to the injestor.
   *
   * Use this when you want to track when specific actions by a player take
   * place such as a player clicking a button or a player entering a specific
   * zone.
   *
   * @param player Player who triggered the event
   * @param tag Analytics tag
   * @param meta Additional meta data
   * @tags [auto, player]
   */
  sendPlayerTriggerEvent(player: Player, tag: string, meta: Record<string, unknown> = {}) {
    if (this.eventDisallowed("playerTrigger", ["custom", "player"])) return;

    this.socket.send(
      "playerTrigger",
      this.buildPlayerEvent(player, {
        tag,
        meta,
      }),
    );
  }

  /**
   * Sends the TriggerEvent to the injestor.
   *
   * Use teis when you want to track when a specific action takes place such as
   * a weather change, a part spawns, or an event triggered by many players.
   *
   * @param tag Analytics tag
   * @param meta Additional meta data
   * @tags [custom, player]
   */
  sendTriggerEvent(tag: string, meta: Record<string, unknown> = {}) {
    if (this.eventDisallowed("trigger", ["custom", "player"])) return;

    this.socket.send("trigger", this.buildEvent({ tag, meta }));
  }

  /**
   * Sends the LocationTrigger to the injestor.
   *
   * Use this for events that occur at a specific location. Such as a part
   * spawning at a random location or any other localized event.
   *
   * @param tag Analytics tag
   * @param player Player who triggered the event
   * @param location Location of the event
   * @param meta Additional meta data
   * @tags [custom, location]
   */
  sendLocationTrigger(tag: string, location: Vector3, meta: Record<string, unknown> = {}) {
    if (this.eventDisallowed("locationTrigger", ["custom", "location"])) return;

    this.socket.send(
      "locationTrigger",
      this.buildEvent({
        tag,
        x: location.X,
        y: location.Y,
        z: location.Z,
        meta,
      }),
    );
  }

  /**
   * Sends the PlayerLocationTriggerEvent to the injestor.
   *
   * Use this when you want to track when a player preforms a specific action
   * and also track the location of that action. Use this for things such as
   * a player dying, a player killing another player, or a player spawning in a
   * vehicle.
   *
   * @param tag Analytics tag
   * @param player Player who triggered the event
   * @param location Location of the event
   * @param meta Additional meta data
   * @tags [custom, player, location]
   */
  sendPlayerLocationTrigger(tag: string, player: Player, location?: Vector3, meta: Record<string, unknown> = {}) {
    if (this.eventDisallowed("playerLocationTrigger", ["custom", "player", "location"])) return;

    if (!location) location = player.Character?.PrimaryPart?.Position;

    if (!location) return;

    this.socket.send(
      "playerLocationTrigger",
      this.buildPlayerEvent(player, {
        tag,
        x: location.X,
        y: location.Y,
        z: location.Z,
        meta,
      }),
    );
  }

  /**
   * Sends the StatsEvent to the injestor.
   *
   * Sends info such at network usage, memory usage, and physics stats. For more
   * info on the stats that are sent, see the Stats service in the Roblox API.
   *
   * Is called automatically and should not be called directly.
   * @tags []
   */
  sendStatsEvent() {
    // This event must be allowed as it acts as a heartbeat
    // if (this.eventDisallowed("stats", ["auto", "intervals"])) return;

    const stats = {
      contactsCount: StatsService.ContactsCount,
      dataReceiveKbps: StatsService.DataReceiveKbps,
      dataSendKbps: StatsService.DataSendKbps,
      heartbeatTimeMs: StatsService.HeartbeatTimeMs,
      instanceCount: StatsService.InstanceCount,
      movingPrimitivesCount: StatsService.MovingPrimitivesCount,
      physicsReceiveKbps: StatsService.PhysicsReceiveKbps,
      physicsSendKbps: StatsService.PhysicsSendKbps,
      physicsStepTimeMs: StatsService.PhysicsStepTimeMs,
      primitivesCount: StatsService.PrimitivesCount,
      totalMemoryUsageMb: StatsService.GetTotalMemoryUsageMb(),
      // Specifc memotry usage
      animationMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("Animation"),
      graphicsMeshPartsMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GraphicsMeshParts"),
      graphicsParticlesMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GraphicsParticles"),
      graphicsPartsMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GraphicsParts"),
      graphicsSolidModelsMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GraphicsSolidModels"),
      graphicsSpatialHashMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GraphicsSpatialHash"),
      graphicsTerrainMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GraphicsTerrain"),
      graphicsTextureMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GraphicsTexture"),
      graphicsTextureCharacterMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GraphicsTextureCharacter"),
      guiMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("Gui"),
      httpCacheMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("HttpCache"),
      instancesMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("Instances"),
      internalMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("Internal"),
      luaHeapMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("LuaHeap"),
      navigationMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("Navigation"),
      physicsCollisionMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("PhysicsCollision"),
      physicsPartsMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("PhysicsParts"),
      scriptMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("Script"),
      signalsMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("Signals"),
      soundsMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("Sounds"),
      streamingSoundsMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("StreamingSounds"),
      terrainVoxelsMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("TerrainVoxels"),
    };

    this.socket.send("stats", this.buildEvent(stats));
  }
}

export default function init(apiKey: string, config: InitConfig = {}) {
  const g = _G as { _BloxAdmin: BloxAdmin };
  g._BloxAdmin = g._BloxAdmin || new BloxAdmin(apiKey, config);

  return g._BloxAdmin;
}
