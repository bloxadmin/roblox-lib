import { Module } from "Module";
import { BloxAdmin } from "BloxAdmin";
import { ChatService, EventType } from "types";
import Datastore from "Datastore";
import { Players, TextChatService } from "@rbxts/services";
import { secondsToHuman } from "utils";

type Plr = Player | number;
type Invoker = Player | number | undefined;
type Reason = string | undefined;
type Duration = number | undefined;

type EventArgs = [Player, Invoker, Reason, Duration];

type Events = {
  Report: EventArgs,
  Warn: EventArgs,
  Kick: EventArgs,
  Mute: EventArgs,
  Unmute: EventArgs,
  Ban: EventArgs,
  Unban: EventArgs,
};

type ModerationStatus = { invoker: number | undefined, reason: Reason, expiry: number };
type ModerationDatastore = {
  muted?: ModerationStatus;
  banned?: ModerationStatus;
};

function getAllTextChannels(): TextChannel[] {
  if (TextChatService.ChatVersion !== Enum.ChatVersion.TextChatService) return [];

  const instances = TextChatService.WaitForChild("TextChannels", 10)?.GetChildren();
  const channels: TextChannel[] = [];

  instances?.filter((instance) => instance.IsA("TextChannel")).forEach((instance) => {
    const channel = instance as TextChannel;
    channels.push(channel);
  });

  return channels;
}

export default class Moderation extends Module<Events> {
  private datastore: Datastore<ModerationDatastore>;
  private ChatService: ChatService | undefined;
  private systemMessageEvent: RemoteEvent<(data: string) => void>;

  private dispatch: boolean = true;
  private mutes: Map<number, number>;

  public Reported = this.getSignal("Report");
  public Warned = this.getSignal("Warn");
  public Kicked = this.getSignal("Kick");
  public Muted = this.getSignal("Mute");
  public Unmuted = this.getSignal("Unmute");
  public Banned = this.getSignal("Ban");
  public Unbanned = this.getSignal("Unban");

  constructor(admin: BloxAdmin) {
    super("Moderation", admin);

    this.datastore = new Datastore("bloxadmin/moderation", {
      exponential: true,
      attempts: 5,
      delay: 1
    });

    this.mutes = new Map();

    this.systemMessageEvent = this.admin.createEvent("ModerationSystemMessageEvent");
  };

  enable() {
    this.admin.messenger.on("message", (data) => {
      const [eventType, action, plr, invoker, reason, duration] = data as [EventType, keyof Events, Plr, Invoker, Reason, Duration];

      if (eventType === EventType.Moderation && action && this[action]) {
        this.dispatch = false;

        this.logger.debug(`${eventType} ${action} ${plr} ${invoker} ${reason} ${duration}`);

        this[action](plr, invoker, reason, duration);
      };
    });

    for (const plr of Players.GetPlayers()) {
      this.check(plr);
    };

    Players.PlayerAdded.Connect((player) => {
      this.check(player);
    });

    Players.PlayerRemoving.Connect((player) => {
      this.mutes.has(player.UserId) && this.mutes.delete(player.UserId);
    });

    task.spawn(() => {
      this.lifecycle(true)
    });

    this.admin.loadLocalScript(script.Parent?.WaitForChild("ModerationLocal"));

    TextChatService.WaitForChild("TextChannels", 10)?.ChildAdded.Connect((channel) => {
      if (!channel.IsA("TextChannel")) return;
      this.configureChatServiceChannel(channel);
    });

    this.on("Mute", (player, _, reason, duration) => {
      if (this.admin.config.moderation.mute) return;

      if (TextChatService.ChatVersion === Enum.ChatVersion.LegacyChatService) {
        this.legacyChatMutePlayer(player, duration, reason);
        return;
      }
      const r = reason ? ` for ${reason}` : "";
      this.systemMessageEvent.FireClient(player, duration ? `You have been muted for ${secondsToHuman(duration)}${r}` : `You have been muted${r}`,);
    });

    this.on("Unmute", (player, _, reason) => {

      if (this.admin.config.moderation.mute) return;
      if (TextChatService.ChatVersion === Enum.ChatVersion.LegacyChatService) {
        this.legacyChatUnmutePlayer(player, reason);
        return;
      }

      this.systemMessageEvent.FireClient(player, "You have been unmuted.");
    })
  };

  // * Public APIs

  public async Report(plr: Plr, invoker: Invoker, reason: Reason) {
    this.logger.debug(`Action: Report, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    this.dispatcher("Report", plr, invoker, reason);
  };

  public async Warn(plr: Plr, invoker: Invoker, reason: Reason) {
    this.logger.debug(`Action: Warn, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    this.dispatcher("Warn", plr, invoker, reason);
  };

  public async Kick(plr: Plr, invoker: Invoker, reason?: string) {
    this.logger.debug(`Action: Kick, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    const player = typeIs(plr, "number") ? Players.GetPlayerByUserId(plr) : plr;

    if (player) {
      if (this.admin.config.moderation.kick) {
        await player.Kick(reason);
      };

      this.dispatcher("Kick", plr, invoker, reason);
    };
  };

  public async Mute(plr: Plr, invoker: Invoker, reason: Reason, duration: Duration) {
    this.logger.debug(`Action: Mute, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}, Duration: ${duration}`);

    const invokerId = typeIs(invoker, "number") ? invoker : invoker?.UserId;
    const id = tostring(typeIs(plr, "number") ? plr : plr.UserId);
    const expiry = duration ? os.time() + duration : -1;

    await this.datastore.update<ModerationDatastore>(id, (old) => {
      return [{ ...old, muted: { invoker: invokerId, reason, expiry } }, undefined, undefined];
    });

    this.dispatcher("Mute", plr, invoker, reason, duration);
  };

  public async Unmute(plr: Plr, invoker: Invoker, reason: Reason) {
    this.logger.debug(`Action: Unmute, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    const player = typeIs(plr, "number") ? Players.GetPlayerByUserId(plr) : plr;
    const id = tostring(plr);

    if (player) {
      this.mutes.delete(player.UserId);
    };

    await this.datastore.update(id, (old) => {
      if (old && old.muted) {
        delete old.muted;
      };

      return [{ ...old }, undefined, undefined];
    });

    this.dispatcher("Unmute", plr, invoker, reason);
  };

  public async IsMuted(plr: Plr) {
    const id = typeIs(plr, "number") ? plr : plr.UserId;

    const muted = this.mutes.get(id);
    if (muted) return muted > os.time() || muted === -1;

    const online = typeIs(plr, "number") ? Players.GetPlayerByUserId(plr) : plr;
    if (online) return false;

    const [result] = await this.datastore.get(tostring(id));
    return !!result && !!result.muted && (result.muted.expiry >= os.time() || result.muted.expiry === -1);
  }

  public async Ban(plr: Plr, invoker: Invoker, reason: Reason, duration: Duration) {
    this.logger.debug(`Action: Ban, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}, Duration: ${duration}`);

    const id = tostring(typeIs(plr, "number") ? plr : plr.UserId);
    const invokerId = typeIs(invoker, "number") ? invoker : invoker?.UserId;
    const expiry = duration ? os.time() + duration : -1;
    const player = typeIs(plr, "number") ? Players.GetPlayerByUserId(plr) : plr;

    if (player) {
      if (this.admin.config.moderation.ban) {
        player.Kick(reason);
      };
    }

    await this.datastore.update(id, (old) => {
      return [{ ...old, banned: { invoker: invokerId, reason, expiry } }, undefined, undefined];
    });


    this.dispatcher("Ban", plr, invoker, reason, duration);
  };

  public async Unban(plr: Plr, invoker: Invoker, reason: Reason) {
    this.logger.debug(`Action: Unban, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    const id = tostring(typeIs(plr, "number") ? plr : plr.UserId);

    await this.datastore.update<ModerationDatastore>(id, (old) => {
      if (old && old.banned) {
        delete old.banned;
      };

      return [{ ...old }, undefined, undefined];
    });

    this.dispatcher("Unban", plr, invoker, reason);
  };

  public async IsBanned(plr: Plr) {
    const id = typeIs(plr, "number") ? plr : plr.UserId;

    const [result] = await this.datastore.get(tostring(id));

    return !!result && !!result.banned && (result.banned.expiry >= os.time() || result.banned.expiry === -1);
  }

  // * Internal APIs

  private async check(plr: Player) {
    const id = tostring(plr.UserId);
    const [result] = await this.datastore.get<ModerationDatastore>(id);

    if (result) {
      if (result.banned) {
        if (result.banned.expiry > os.time() || result.banned.expiry === -1) {
          if (this.admin.config.moderation.ban) {
            plr.Kick(result.banned.reason);
          };

          this.logger.debug(`Action: Ban Check, Player: ${plr}, Invoker ${result.banned.invoker}, Reason: ${result.banned.reason}, Expiry: ${result.banned.expiry}`);

          this.emit("Ban", plr, result.banned.invoker, result.banned.reason, result.banned.expiry === -1 ? -1 : os.time() - result.banned.expiry);
        } else {
          this.dispatch = false;

          await this.Unban(plr.UserId, undefined, "Ban expired.");
        };
      };

      if (result.muted) {
        if (result.muted.expiry > os.time() || result.muted.expiry === -1) {
          if (result.muted.expiry > 0) {
            this.mutes.set(plr.UserId, result.muted.expiry);
          };

          this.logger.debug(`Action: Mute Check, Player: ${plr}, Invoker ${result.muted.invoker}, Reason: ${result.muted.reason}, Expiry: ${result.muted.expiry}`);

          this.emit("Mute", plr, result.muted.invoker, result.muted.reason, result.muted.expiry === -1 ? -1 : os.time() - result.muted.expiry);
        } else {
          this.dispatch = false;

          await this.Unmute(plr.UserId, undefined, "Mute expired.");
        };
      };
    };
  };

  private lifecycle = async (loop = true) => {
    const promises: Promise<void>[] = [];
    for (const [plrId, expiry] of pairs(this.mutes)) {
      if (expiry < os.time()) {
        promises.push(this.Unmute(plrId, undefined, "Mute expired."));
      };
    };

    await Promise.allSettled(promises);

    if (loop) {
      task.delay(1, () => {
        this.lifecycle(true);
      });
    };
  };

  private dispatcher<Action extends keyof Events>(action: Action, plr: Plr, invoker: Invoker, reason: Reason, duration?: number) {
    const playerId = typeIs(plr, "number") ? plr : plr.UserId;

    if (this.dispatch) {
      // const gameId = game.GameId;

      // const url = `${this.admin.config.api.base}/games/${gameId}/players/${playerId}/moderation`;

      // this.admin.messenger.post(url, {
      //   action: action.lower(),
      //   invoker,
      //   reason,
      //   duration
      // });
    } else {
      this.dispatch = true;
    };

    this.logger.debug(`Dispatcher -> Action: ${action}, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}, Duration: ${duration}`);

    const player = typeIs(plr, "number") ? Players.GetPlayerByUserId(plr) : plr;

    if (player) {
      this.emit(action, player, invoker, reason, duration);
    }
  };

  // * Auto mute methods

  private chatService() {
    if (this.ChatService) return this.ChatService;

    const ChatServiceModule = game
      .GetService("ServerScriptService")
      ?.WaitForChild("ChatServiceRunner", 10)
      ?.WaitForChild("ChatService", 10) as ModuleScript | undefined;
    const ChatService = ChatServiceModule ? require(ChatServiceModule) as ChatService : undefined;

    if (!ChatService) {
      this.logger.warn("ChatService not found");
      return undefined;
    }

    this.ChatService = ChatService;

    return ChatService;
  }

  private configureChatServiceChannel(channel: TextChannel) {
    channel.ShouldDeliverCallback = (message: TextChatMessage, destination: TextSource) => {
      const playerId = message.TextSource?.UserId;
      if (!playerId) return true;
      const player = Players.GetPlayerByUserId(playerId);
      if (!player) return true;

      const [error, isMuted] = this.IsMuted(player).await();

      if (error) return true;

      if (isMuted) {
        this.systemMessageEvent.FireClient(player, "You are muted and your messages will not be seen by others.");
      } else if (!isMuted && message.TextChannel && message.TextChannel.Name.sub(1, 10) === "RBXWhisper") {
        const destinationPlayer = Players.GetPlayerByUserId(destination.UserId);
        if (destinationPlayer) {
          const [error, destinationIsMuted] = this.IsMuted(destinationPlayer).await();

          if (!error && destinationIsMuted) {
            this.systemMessageEvent.FireClient(player, "The player you are trying to whisper is muted and cannot respond.");
          }
        }
      }

      return !isMuted;
    }
  }

  private legacyChatMutePlayer(player: Player, seconds?: number, reason?: string) {
    const ChatService = this.chatService()
    if (!ChatService) return;

    const speaker = ChatService.GetSpeaker(player.Name);
    const r = reason ? ` for ${reason}` : "";

    speaker?.GetChannelList()?.forEach((channelName) => {
      const channel = ChatService.GetChannel(channelName);
      channel?.MuteSpeaker(speaker.Name, undefined, seconds);
    });
    speaker?.SendSystemMessage(
      seconds ? `You have been muted for ${secondsToHuman(seconds)}${r}` : `You have been muted${r}`,
      "System",
    );
  }

  private legacyChatUnmutePlayer(player: Player, reason?: string) {
    const ChatService = this.chatService()
    if (!ChatService) return;

    const speaker = ChatService.GetSpeaker(player.Name);
    speaker?.GetChannelList()?.forEach((channelName) => {
      const channel = ChatService.GetChannel(channelName);
      if (!channel || !channel.IsSpeakerMuted(speaker.Name)) return;

      channel.UnmuteSpeaker(speaker.Name);
    });
    speaker?.SendSystemMessage("You have been unmuted.", "System");
  }
};
