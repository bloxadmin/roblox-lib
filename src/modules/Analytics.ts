import { BloxAdmin } from "BloxAdmin";
import { BLOXADMIN_VERSION, DEFAULT_CONFIG } from "consts";
import { Module } from "Module";
import { Event } from "types";

const Players = game.GetService("Players");
const LogService = game.GetService("LogService");
const ScriptContext = game.GetService("ScriptContext");
const StatsService = game.GetService("Stats");
const MarketplaceService = game.GetService("MarketplaceService");

export default class Analytics extends Module {
  constructor(admin: BloxAdmin) {
    super("Analytics", admin);
  }

  enable(): void {
    // this.admin.socket.on("connect", () => {
    //   this.logger.info("Connected to injestor");
    // });

    // this.admin.socket.on("disconnect", () => {
    //   this.logger.info("Disconnected from injestor");
    // });

    // this.admin.socket.on("error", (err) => {
    //   this.logger.error("Api Error:", err);
    // });

    this.defaultEvents();
    if (this.admin.config.intervals.stats) this.statsInterval();
    if (this.admin.config.intervals.playerPositions) this.playerPositionInterval();
    if (this.admin.config.intervals.playerCursors) this.playerCursorInterval();
    this.heartbeatInterval();
  }

  private setupPlayer(player: Player) {
    this.sendPlayerJoinEvent(player);

    player.Chatted.Connect((message, recipient) => {
      this.sendPlayerChatEvent(player, message, recipient);
    });
  }

  private defaultEvents() {
    game.BindToClose(() => {
      this.sendServerCloseEvent();
      // this.admin.socket.close();
      this.admin.socket.syncFlush();
    });

    Players.PlayerAdded.Connect((player) => {
      this.setupPlayer(player);
    });

    Players.GetChildren().forEach((player) => {
      this.setupPlayer(player as Player);
    });

    Players.PlayerRemoving.Connect((player) => this.sendPlayerLeaveEvent(player));

    LogService.MessageOut.Connect((message, msgType) => {
      this.sendConsoleLogEvent(message, msgType);
    });

    ScriptContext.Error.Connect((message, trace, sk) => {
      this.sendScriptErrorEvent(message, trace, sk);
    });

    MarketplaceService.PromptBundlePurchaseFinished.Connect((player, bundleId, wasPurchased) => {
      this.sendMarketplaceBundlePurchaseFinishedEvent(player, bundleId, wasPurchased);
    });

    MarketplaceService.PromptGamePassPurchaseFinished.Connect((player, gamePassId, wasPurchased) => {
      this.sendMarketplaceGamePassPurchaseFinishedEvent(player, gamePassId, wasPurchased);
    });

    MarketplaceService.PromptPremiumPurchaseFinished.Connect(((...args: unknown[]) => {
      // this.sendMarketplacePremiumPurchaseFinishedEvent(player);
    }) as unknown as () => void);

    MarketplaceService.PromptPurchaseFinished.Connect((player, assetId, wasPurchased) => {
      this.sendMarketplacePromptPurchaseFinishedEvent(player, assetId, wasPurchased);
    });

    try {
      // eslint-disable-next-line roblox-ts/no-any
      (MarketplaceService as unknown as any).PromptProductPurchaseFinished.Connect(
        (player: Player, productId: number, wasPurchased: boolean) => {
          this.sendMarketplaceProductPurchaseFinishedEvent(player, productId, wasPurchased);
        },
      );
    } catch (e) {
      // Ignored
    }

    try {
      // eslint-disable-next-line roblox-ts/no-any
      (MarketplaceService as unknown as any).ThirdPartyPurchaseFinished.Connect(
        (player: Player, productId: number, receipt: string, wasPurchased: boolean) => {
          this.sendMarketplaceThirdPartyPurchaseFinishedEvent(player, productId, receipt, wasPurchased);
        },
      );
    } catch (e) {
      // Ignored
    }

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

  private buildEvent<D = Record<string, unknown>>(data: D) {
    return {
      eventTime: os.time() * 1000,
      // These were removed as the new injest system has them included into the URL
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
      sessionId: this.admin.getPlayerSessionId(player.UserId),
      ...data,
    });
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
    this.admin.socket.send(
      "heartbeat",
      this.buildEvent({
        // Stats
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
        // Players
        onlineCount: Players.GetPlayers().size(),
        players: (Players.GetChildren() as Player[]).map((p) => p.UserId),
      }),
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
    this.admin.socket.send(
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
    this.admin.socket.send("serverClose", this.buildEvent({}));
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

    this.admin.socket.send(
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

    this.admin.socket.send(
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

    this.admin.socket.send(
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

    this.admin.socket.send("playerLeave", this.buildPlayerEvent(player, { followPlayerId: 0 }));
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

    this.admin.socket.send(
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

    this.admin.socket.send(
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

    this.admin.socket.send(
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

    this.admin.socket.send(
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

    this.admin.socket.send("trigger", this.buildEvent({ tag, meta }));
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

    this.admin.socket.send(
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

    this.admin.socket.send(
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

  sendMarketplaceBundlePurchaseFinishedEvent(player: Player, bundleId: number, wasPurchased: boolean) {
    if (this.eventDisallowed("marketplaceBundlePurchaseFinished", ["player", "marketplace"])) return;

    this.admin.socket.send(
      "marketplaceBundlePurchaseFinished",
      this.buildPlayerEvent(player, {
        bundleId,
        wasPurchased,
      }),
    );
  }

  sendMarketplaceGamePassPurchaseFinishedEvent(player: Player, gamePassId: number, wasPurchased: boolean) {
    if (this.eventDisallowed("marketplaceGamePassPurchaseFinished", ["player", "marketplace"])) return;

    this.admin.socket.send(
      "marketplaceGamePassPurchaseFinished",
      this.buildPlayerEvent(player, {
        gamePassId,
        wasPurchased,
      }),
    );
  }

  sendMarketplacePremiumPurchaseFinishedEvent(player: Player, wasPurchased: boolean) {
    if (this.eventDisallowed("marketplacePremiumPurchaseFinished", ["player", "marketplace"])) return;

    this.admin.socket.send(
      "marketplacePremiumPurchaseFinished",
      this.buildPlayerEvent(player, {
        wasPurchased,
      }),
    );
  }

  sendMarketplacePromptPurchaseFinishedEvent(player: Player, assetId: number, wasPurchased: boolean) {
    if (this.eventDisallowed("marketplacePromptPurchaseFinished", ["player", "marketplace"])) return;

    this.admin.socket.send(
      "marketplacePromptPurchaseFinished",
      this.buildPlayerEvent(player, {
        assetId,
        wasPurchased,
      }),
    );
  }

  sendMarketplaceThirdPartyPurchaseFinishedEvent(
    player: Player,
    productId: number,
    receipt: string,
    wasPurchased: boolean,
  ) {
    if (this.eventDisallowed("marketplaceThirdPartyPurchaseFinished", ["player", "marketplace"])) return;

    this.admin.socket.send(
      "marketplaceThirdPartyPurchaseFinished",
      this.buildPlayerEvent(player, {
        productId,
        receipt,
        wasPurchased,
      }),
    );
  }

  sendMarketplaceProductPurchaseFinishedEvent(player: Player, productId: number, wasPurchased: boolean) {
    if (this.eventDisallowed("marketplaceProductPurchaseFinished", ["player", "marketplace"])) return;

    this.admin.socket.send(
      "marketplaceProductPurchaseFinished",
      this.buildPlayerEvent(player, {
        productId,
        wasPurchased,
      }),
    );
  }

  sendProcessReceiptEvent(receiptInfo: ReceiptInfo) {
    // Function requires extra protection as it could break people's games
    try {
      if (this.eventDisallowed("processReceipt", ["marketplace"])) return;

      this.admin.socket.send(
        "marketplaceProcessReceipt",
        this.buildEvent({
          playerId: receiptInfo.PlayerId,
          sessionId: this.admin.getPlayerSessionId(receiptInfo.PlayerId, false) || undefined,
          productId: receiptInfo.ProductId,
          amount: receiptInfo.CurrencySpent,
          placeIdWherePurchased: receiptInfo.PlaceIdWherePurchased,
        }),
      );
    } catch (e) {
      this.logger.warn(`CRIT: Error sending processReceipt event: ${e}`);
    }
  }

  sendEconomyEvent(
    sender: number,
    recipient: number,
    currency: string,
    amount: number,
    item: string,
    meta: Record<string, unknown> = {},
  ) {
    // TODO: implement
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

    this.admin.socket.send("stats", this.buildEvent(stats));
  }
}
