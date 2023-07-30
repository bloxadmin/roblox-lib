import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { ChatChannel, ChatService, EventType } from "types";

const Players = game.GetService("Players");
const TextChatService = game.GetService("TextChatService");

export enum ModerationType {
  Kick = "kick",
  Mute = "mute",
  Unmute = "unmute",
}

const NOTIFICATION_COOLDOWN = 5;
const TIME_UNITS = {
  "s": 1,
  "m": 60,
  "h": 60 * 60,
  "d": 60 * 60 * 24,
  "w": 60 * 60 * 24 * 7,
  "mo": 60 * 60 * 24 * 30,
  "y": 60 * 60 * 24 * 365,
  "kys": 60 * 60 * 24 * 365 * 1000,
};
const TIME_UNITS_NAMES: [string, number][] = [
  ["kiloyears", TIME_UNITS.kys],
  ["years", TIME_UNITS.y],
  ["days", TIME_UNITS.d],
  ["hours", TIME_UNITS.h],
  ["minutes", TIME_UNITS.m],
  ["seconds", TIME_UNITS.s],
];

function secondsToHuman(seconds: number) {
  const parts: string[] = [];

  for (const [unit, secondsInUnit] of TIME_UNITS_NAMES) {
    const count = math.floor(seconds / secondsInUnit);
    if (count > 0) {
      if (count === 1) {
        parts.push(`${count} ${unit.sub(1, -2)}`);
      } else {
        parts.push(`${count} ${unit}`);
      }
      seconds -= count * secondsInUnit;
    }
  }

  if (parts.size() > 1) {
    // add "and" before last part
    parts[parts.size() - 1] = `and ${parts[parts.size() - 1]}`;
  }

  return parts.join(" ");
}

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


export default class Moderation extends Module<{
  kick: [Player, string];
  ban: [Player, number, string];
  unban: [Player, string];
  mute: [Player, number, string];
  unmute: [Player, string];
}> {
  private playersMutedUntil: Record<number, number> = {};
  private lastNotifiedMuted: Record<number, number> = {};
  private systemMessageEvent: RemoteEvent<(data: string) => void>;
  private ChatService: ChatService | undefined;

  // private autoModEnabled = false;
  // private autoModTime = 0;
  // private autoModBadWords: string[] = [];

  constructor(admin: BloxAdmin) {
    super("Moderation", admin);

    this.systemMessageEvent = this.admin.createEvent("ModerationSystemMessageEvent");
  }

  enable(): void {
    this.admin.loadLocalScript(script.Parent?.WaitForChild("ModerationLocal"));

    this.admin.messenger.on("message", (data) => {
      const [eventType, moderationType, playerId, untilTime, reason, realDuration] = data as [
        EventType,
        ModerationType,
        number,
        number | undefined,
        string | undefined,
        number | undefined,
      ];
      if (eventType !== EventType.Moderation) return;
      if (!moderationType) return;

      const player = Players.GetPlayerByUserId(playerId);

      if (!player) {
        this.logger.warn(`Player ${playerId} not found when trying to ${moderationType}`);
        return;
      }

      switch (moderationType) {
        case ModerationType.Kick:
          this.kick(player, reason);
          break;
        case ModerationType.Mute:
          this.mute(player, untilTime, reason, realDuration);
          break;
        case ModerationType.Unmute:
          this.unmute(player, reason);
          break;
      }
    });

    getAllTextChannels().forEach((channel) => {
      this.configureChannel(channel);
    });

    TextChatService.WaitForChild("TextChannels", 10)?.ChildAdded.Connect((channel) => {
      if (!channel.IsA("TextChannel")) return;
      this.configureChannel(channel);
    });

    // const remoteConfig = this.admin.GetService("RemoteConfig");

    // remoteConfig.watch<boolean>("$chat.automod", (data) => {
    //   this.autoModEnabled = data;
    //   this.logger.debug(`Auto mod enabled: ${data}`);
    // });
    // remoteConfig.watch<string>("$chat.automod.time", (data) => {
    //   // format: 1s 1m 1mo 1y 1kys
    //   const time = tonumber(data.gsub("[^%d]", "")[0]) || 0;
    //   const unit = data.lower().gsub("[^%a]", "")[0] as keyof typeof TIME_UNITS;

    //   if (!time || !unit || !TIME_UNITS[unit]) {
    //     this.logger.warn(`Invalid auto mod time: ${data}`);
    //     return;
    //   }

    //   this.autoModTime = time * TIME_UNITS[unit];
    //   this.logger.debug(`Auto mod time: ${this.autoModTime}`);
    // });
    // remoteConfig.watch<string[]>("$chat.automod.phrases", (data) => {
    //   this.autoModBadWords = data;
    //   this.logger.debug(`Auto mod bad words: ${data.join(', ')}`);
    // });

    spawn(() => {
      delay(1, () => {
        this.unmuteCheck(true)
      });
    })
  }

  chatService() {
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

  kick(player: Player, reason?: string) {
    this.logger.info(`Kicking ${player.Name} for ${reason}`);
    player.Kick(reason);
  }

  private muteLegacy(player: Player, seconds?: number, reason?: string) {
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

  // Chat 

  unmuteCheck(loop = false) {
    for (const [playerId, untilTime] of pairs(this.playersMutedUntil)) {
      if (untilTime !== -1 && untilTime < os.time()) {
        const player = Players.GetPlayerByUserId(playerId);
        if (player)
          this.unmute(player, "Mute expired");
      }
    }

    if (loop)
      delay(1, () => {
        this.unmuteCheck(true)
      });
  }

  isPlayerMuted(player: Player | number) {
    const playerId = typeIs(player, "number") ? player : player.UserId;
    return this.playersMutedUntil[playerId] && (this.playersMutedUntil[playerId] === -1 || this.playersMutedUntil[playerId] > os.time());
  }


  private configureChannel(channel: TextChannel) {
    channel.ShouldDeliverCallback = (message: TextChatMessage, destination: TextSource) => {
      const playerId = message.TextSource?.UserId;
      if (!playerId) return true;
      const player = Players.GetPlayerByUserId(playerId);
      if (!player) return true;

      const isMuted = this.isPlayerMuted(player);

      if (isMuted && (!this.lastNotifiedMuted[playerId] || this.lastNotifiedMuted[playerId] + NOTIFICATION_COOLDOWN < os.time())) {
        this.lastNotifiedMuted[playerId] = os.time();
        this.systemMessageEvent.FireClient(player, "You are muted and your messages will not be seen by others.");
      } else if (!isMuted && message.TextChannel && message.TextChannel.Name.sub(1, 10) === "RBXWhisper") {
        const destinationPlayer = Players.GetPlayerByUserId(destination.UserId);
        if (destinationPlayer) {
          const destinationIsMuted = this.isPlayerMuted(destinationPlayer);

          if (destinationIsMuted) {
            this.systemMessageEvent.FireClient(player, "The player you are trying to whisper is muted and cannot respond.");
          }
        }
      }

      return !isMuted;
    }
  }

  mute(player: Player, untilTime?: number, reason?: string, realDuration?: number) {
    this.logger.info(`Muting ${player.Name} for ${reason} until ${untilTime}`);
    this.playersMutedUntil[player.UserId] = untilTime || -1;

    const seconds = untilTime ? untilTime - os.time() : undefined;

    if (TextChatService.ChatVersion === Enum.ChatVersion.LegacyChatService) {
      this.muteLegacy(player, seconds, reason);
      return;
    }
    const r = reason ? ` for ${reason}` : "";
    this.systemMessageEvent.FireClient(player, seconds ? `You have been muted for ${secondsToHuman(realDuration || seconds)}${r}` : `You have been muted${r}`,);
  }

  private unmuteLegacy(player: Player, reason?: string) {
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

  unmute(player: Player, reason?: string) {
    this.logger.info(`Unmuting ${player.Name} for ${reason}`);
    delete this.playersMutedUntil[player.UserId];

    if (TextChatService.ChatVersion === Enum.ChatVersion.LegacyChatService) {
      this.unmuteLegacy(player, reason);
      return;
    }

    this.systemMessageEvent.FireClient(player, "You have been unmuted.");
  }
}
