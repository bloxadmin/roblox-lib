import { BloxAdmin } from "BloxAdmin";
import { BLOXADMIN_VERSION, DEFAULT_CONFIG } from "consts";
import { Module } from "Module";
import { Event, EventType, PlayerReadyData, ScriptErrorData } from "types";

const LogService = game.GetService("LogService");
const MarketplaceService = game.GetService("MarketplaceService");
const Players = game.GetService("Players");
const RunService = game.GetService("RunService");
const ScriptContext = game.GetService("ScriptContext");
const StatsService = game.GetService("Stats");
const LocalizationService = game.GetService("LocalizationService");
const PolicyService = game.GetService("PolicyService");

const remoteLocalEvents: string[] = [
  "heartbeat",
  "stats",
];

export default class Analytics extends Module {
  playerJoinTimes: Record<number, number> = {};
  scriptErrorEvent: RemoteEvent<() => void>;
  playerReadyEvent: RemoteEvent<(data: PlayerReadyData) => void>;

  constructor(admin: BloxAdmin) {
    super("Analytics", admin);

    this.scriptErrorEvent = this.admin.createEvent("ScriptErrorEvent");
    this.playerReadyEvent = this.admin.createEvent("AnalyticsPlayerReadyEvent");
    this.admin.loadLocalScript(script.Parent?.WaitForChild("AnalyticsLocal"));
  }

  enable(): void {
    // this.on("connect", () => {
    //   this.logger.info("Connected to injestor");
    // });

    // this.on("disconnect", () => {
    //   this.logger.info("Disconnected from injestor");
    // });

    // this.on("error", (err) => {
    //   this.logger.error("Api Error:", err);
    // });

    this.defaultEvents();
    if (this.admin.config.intervals.stats) this.statsInterval();
    if (this.admin.config.intervals.playerPositions) this.playerPositionInterval();
    if (this.admin.config.intervals.playerCursors) this.playerCursorInterval();
    this.heartbeatInterval();
  }

  send(name: string, segments: Record<string, string>, data: unknown, priority = 0) {
    if (RunService.IsStudio() && !this.admin.config.api.DEBUGGING_ONLY_runInStudio) {
      this.logger.verbose(`Not sending event (${name}) because in studio`);
      return;
    }

    this.logger.verbose(`Sending event ${name}`);

    const message: [EventType, string, number, Record<string, string>, unknown] = [
      EventType.Analytics, name, os.time(), segments, data
    ];

    if (remoteLocalEvents.includes(name)) {
      this.admin.messenger.sendRemoteLocal(message);
    } else {
      this.admin.messenger.sendRemote(message, priority).catch((e) => {
        this.logger.error(`Error sending event (${name}):`, tostring(e));
      });
    }
  }

  private setupPlayer(player: Player) {
    this.playerJoinTimes[player.UserId] = os.time();

    this.sendPlayerJoinEvent(player);

    player.Chatted.Connect((message, recipient) => {
      this.sendPlayerChatEvent(player, message, recipient);
    });
  }

  private defaultEvents() {
    game.BindToClose(() => {
      this.sendServerCloseEvent();

      this.admin.messenger.serverStop();
    });

    Players.PlayerAdded.Connect((player) => {
      this.setupPlayer(player);
    });

    Players.GetChildren().forEach((player) => {
      if (player.IsA("Player")) this.setupPlayer(player);
    });

    Players.PlayerRemoving.Connect((player) => {
      this.sendPlayerLeaveEvent(player);

      const id = player.UserId;

      delay(60, () => {
        if (Players.GetPlayerByUserId(id)) return;

        this.admin.endPlayerSession(id);
      });
    });

    this.playerReadyEvent.OnServerEvent.Connect((player, data) => {
      this.sendPlayerReadyEvent(player, data as PlayerReadyData);
    });

    this.scriptErrorEvent.OnServerEvent.Connect((player, data) => {
      this.sendScriptErrorEvent({ ...data as ScriptErrorData }, player)
    });

    LogService.MessageOut.Connect((message, msgType) => {
      this.sendConsoleLogEvent(message, msgType);
    });

    ScriptContext.Error.Connect((message, stack, sk) => {
      this.sendScriptErrorEvent({ message, stack, script: sk?.GetFullName() });
    });

    MarketplaceService.PromptBundlePurchaseFinished.Connect((player, bundleId, wasPurchased) => {
      this.sendMarketplaceBundlePurchaseFinishedEvent(player, bundleId, wasPurchased);
    });

    MarketplaceService.PromptGamePassPurchaseFinished.Connect((player, gamePassId, wasPurchased) => {
      this.sendMarketplaceGamePassPurchaseFinishedEvent(player, gamePassId, wasPurchased);
    });

    MarketplaceService.PromptPurchaseFinished.Connect((player, assetId, wasPurchased) => {
      this.sendMarketplacePromptPurchaseFinishedEvent(player, assetId, wasPurchased);
    });

    this.sendServerOpenEvent();
  }

  private statsInterval() {
    this.sendStatsEvent();

    delay(this.admin.config.intervals.stats, () => this.statsInterval());
  }

  private playerPositionInterval() {
    Players.GetPlayers().forEach((player) => {
      this.sendPlayerPositionEvent(player);
    });

    delay(this.admin.config.intervals.playerPositions, () => this.playerPositionInterval());
  }

  private playerCursorInterval() {
    Players.GetPlayers().forEach((player) => {
      // this.sendPlayerCursorPositionEvent(player);
    });

    delay(this.admin.config.intervals.playerCursors, () => this.playerCursorInterval());
  }

  private heartbeatInterval() {
    this.sendHeartbeat();

    // This event must be allowed, so 0 interval will be changed to the default
    // as to not be sending it 34.48 times a second
    delay(this.admin.config.intervals.heartbeat || DEFAULT_CONFIG.intervals.heartbeat, () => this.heartbeatInterval());
  }

  private getPlayerSegments(player: Player | number) {
    if (!typeIs(player, "number")) {
      player = player.UserId;
    }
    return {
      player: `${player}`,
      session: this.admin.getPlayerSessionId(player),
    };
  }

  private eventDisallowed(
    event: Event,
    tags: ("intervals" | "player" | "auto" | "custom" | "text" | "location" | "marketplace")[],
  ) {
    if (this.admin.config.events.disallow.includes(event)) return true;

    if (tags.includes("intervals") && this.admin.config.events.disableIntervals) return true;
    if (tags.includes("player") && this.admin.config.events.disablePlayer) return true;
    if (tags.includes("auto") && this.admin.config.events.disableAuto) return true;
    if (tags.includes("custom") && this.admin.config.events.disableCustom) return true;

    if (tags.includes("auto") && tags.includes("player") && this.admin.config.events.disableAutoPlayer) return true;

    if (tags.includes("custom") && tags.includes("player") && this.admin.config.events.disableCustomPlayer) return true;
    if (tags.includes("custom") && tags.includes("player") && this.admin.config.events.disableCustomPlayer) return true;

    if (tags.includes("text") && this.admin.config.events.disableText) return true;
    if (tags.includes("text") && tags.includes("player") && this.admin.config.events.disablePlayerText) return true;

    if (tags.includes("location") && this.admin.config.events.disableLocation) return true;
    if (tags.includes("location") && tags.includes("player") && this.admin.config.events.disablePlayerlocation)
      return true;

    if (tags.includes("marketplace") && this.admin.config.events.disableMarketplace) return true;

    return false;
  }

  /**
   * Called every so often to tell the injestor the server is still alive
   * also contains some info to make sure the injestor has the most up to
   * date information
   *
   * Is called automatically and should not be called directly.
   *
   * @tags []
   */
  private sendHeartbeat() {
    // This event must be allowed
    this.send(
      "heartbeat",
      {},
      {
        // Players
        onlineCount: Players.GetPlayers().size(),
        players: (Players.GetChildren() as Player[]).map((p) => ({
          id: p.UserId,
          name: p.Name,
          joinedAt: this.playerJoinTimes[p.UserId],
        })),
      },
      10, // High priority as this is used to check if the server is still alive
    );
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
    this.send(
      "serverOpen",
      {},
      {
        placeVersion: game.PlaceVersion,
        privateServerId: game.PrivateServerId,
        privateServerOwnerId: game.PrivateServerOwnerId,
        scriptVersion: BLOXADMIN_VERSION,
      },
      15,
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
    this.send("serverClose", {}, {}, 5);
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

    if (message.sub(0, 10) === "[BloxAdmin") return;

    this.send(
      "consoleLog",
      {},
      {
        message: message,
        messageType: msgType.Name,
      },
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
  sendScriptErrorEvent(data: ScriptErrorData, player?: Player) {
    if (this.eventDisallowed("scriptError", ["auto"])) return;

    let segments = player ? this.getPlayerSegments(player) : {};

    if (player) {
      data.message = data.message.gsub(player.Name, "PlayerName")[0]
      data.stack = data.stack.gsub(player.Name, "PlayerName")[0]

      if (data.script)
        data.script = data.script.gsub(player.Name, "PlayerName")[0]
    }

    this.send("scriptError", segments, {
      error: data,
      occurence: {
        placeId: game.PlaceId,
        placeVersion: game.PlaceVersion,
        playerId: player ? player.UserId : undefined
      }
    });
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

    this.send("playerJoin", this.getPlayerSegments(player), {
      name: player.Name,
      sourceGameId: joinData.SourceGameId !== undefined ? joinData.SourceGameId : undefined,
      sourcePlaceId: joinData.SourcePlaceId !== undefined ? joinData.SourcePlaceId : undefined,
      partyMembers: joinData.Members?.map((m) => m) || [],
      teleportData: joinData.TeleportData,
      countryCode: LocalizationService.GetCountryRegionForPlayerAsync(player),
      policy: PolicyService.GetPolicyInfoForPlayerAsync(player),
    });
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

    const playTime = this.playerJoinTimes[player.UserId] ? os.time() - this.playerJoinTimes[player.UserId] : 0;

    this.send("playerLeave", this.getPlayerSegments(player), {
      followPlayerId: 0,
      playTime,
    });
  }

  sendPlayerReadyEvent(player: Player, data: PlayerReadyData) {
    if (this.eventDisallowed("playerReady", ["auto", "player"])) return;

    this.send("playerReady", this.getPlayerSegments(player), data);
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

    this.send("playerPosition", this.getPlayerSegments(player), {
      x: position.X,
      y: position.Y,
      z: position.Z,
      pitch: orientation.X,
      yaw: orientation.Y,
      roll: orientation.Z,
    });
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

    this.send("playerChat", this.getPlayerSegments(player), {
      message,
      recipientId: recipient?.UserId,
    });
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

    this.send("playerTextInput", this.getPlayerSegments(player), {
      tag,
      text,
      meta,
    });
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

    this.send("playerTrigger", this.getPlayerSegments(player), {
      tag,
      meta,
    });
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

    this.send(tag, {}, meta);
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

    this.send(
      tag,
      {},
      {
        x: location.X,
        y: location.Y,
        z: location.Z,
        ...meta,
      },
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

    this.send(tag, this.getPlayerSegments(player), {
      x: location.X,
      y: location.Y,
      z: location.Z,
      ...meta,
    });
  }

  sendMarketplaceBundlePurchaseFinishedEvent(player: Player, bundleId: number, wasPurchased: boolean) {
    if (this.eventDisallowed("marketplaceBundlePurchaseFinished", ["player", "marketplace"])) return;

    this.send("marketplaceBundlePurchaseFinished", this.getPlayerSegments(player), {
      bundleId,
      wasPurchased,
    });
  }

  sendMarketplaceGamePassPurchaseFinishedEvent(player: Player, gamePassId: number, wasPurchased: boolean) {
    if (this.eventDisallowed("marketplaceGamePassPurchaseFinished", ["player", "marketplace"])) return;

    this.send("marketplaceGamePassPurchaseFinished", this.getPlayerSegments(player), {
      gamePassId,
      wasPurchased,
    });
  }

  sendMarketplacePromptPurchaseFinishedEvent(player: Player, assetId: number, wasPurchased: boolean) {
    if (this.eventDisallowed("marketplacePromptPurchaseFinished", ["player", "marketplace"])) return;

    this.send("marketplacePromptPurchaseFinished", this.getPlayerSegments(player), {
      assetId,
      wasPurchased,
    });
  }

  ProcessReceipt(receipt: ReceiptInfo, decision: Enum.ProductPurchaseDecision) {
    if (this.eventDisallowed("marketplaceProcessReceipt", ["player", "marketplace"])) return;

    this.send("marketplaceProcessReceipt", this.getPlayerSegments(receipt.PlayerId), {
      currencySpent: receipt.CurrencySpent,
      productId: receipt.ProductId,
      purchaseId: receipt.PurchaseId,
      placeId: receipt.PlaceIdWherePurchased,
      wasPurchased: decision.Name === "PurchaseGranted",
    });
  }

  sendMemoryStoreServiceQuotaUsageEvent(usage: number) {
    if (this.eventDisallowed("memoryStoreServiceQuotaUsage", ["auto", "intervals"])) return;

    this.send(
      "memoryStoreServiceQuotaUsage",
      {},
      {
        usage,
      },
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

    const stats: {
      [satName: string]: number;
    } = {
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
      geometryCsgMemoryUsageMb: StatsService.GetMemoryUsageMbForTag("GeometryCSG"),
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

    this.send("stats", {}, stats);
  }
}
