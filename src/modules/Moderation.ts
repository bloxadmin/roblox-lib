import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { ChatChannel, ChatService, EventType } from "types";

const Players = game.GetService("Players");
const ChatServiceModule = game
  .GetService("ServerScriptService")
  ?.WaitForChild("ChatServiceRunner", 10)
  ?.WaitForChild("ChatService", 10) as ModuleScript | undefined;
const ChatService = ChatServiceModule ? require(ChatServiceModule) as ChatService : undefined;
const TextChatService = game.GetService("TextChatService");

export enum ModerationType {
  Kick = "kick",
  Mute = "mute",
  Unmute = "unmute",
}

const NOTIFICATION_COOLDOWN = 5;

function secondsToMinutesSeconds(seconds: number) {
  const minutes = math.floor(seconds / 60);
  const secondsLeft = seconds % 60;
  if (minutes > 0) {
    if (secondsLeft === 0) return `${minutes} minutes`;

    return `${minutes} minutes and ${secondsLeft} seconds`;
  }
  return `${secondsLeft} seconds`;
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

function getPlayerTextSources(player: Player): TextSource[] {
  const sources: TextSource[] = [];

  getAllTextChannels().forEach((channel) => {
    const instances = channel.GetChildren();

    instances?.filter((instance) => instance.IsA("TextSource")).forEach((instance) => {
      const source = instance as TextSource;
      if (source.UserId === player.UserId) sources.push(source);
    });
  });

  return sources;
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

  constructor(admin: BloxAdmin) {
    super("Moderation", admin);

    this.systemMessageEvent = this.admin.createEvent("ModerationSystemMessageEvent");
    this.admin.loadLocalScript(script.Parent?.WaitForChild("ModerationLocal"));
  }

  enable(): void {
    this.admin.messenger.on("message", (data) => {
      const [eventType, moderationType, playerId, untilTime, reason] = data as [
        EventType,
        ModerationType,
        number,
        number | undefined,
        string | undefined,
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
          this.mute(player, untilTime, reason);
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
  }

  kick(player: Player, reason?: string) {
    this.logger.info(`Kicking ${player.Name} for ${reason}`);
    player.Kick(reason);
  }

  private muteLegacy(player: Player, seconds?: number, reason?: string) {
    if (!ChatService) return;

    const speaker = ChatService.GetSpeaker(player.Name);
    const r = reason ? ` for ${reason}` : "";

    speaker?.GetChannelList()?.forEach((channelName) => {
      const channel = ChatService.GetChannel(channelName);
      channel?.MuteSpeaker(speaker.Name, undefined, seconds);
    });
    speaker?.SendSystemMessage(
      seconds ? `You have been muted for ${secondsToMinutesSeconds(seconds)}${r}` : `You have been muted${r}`,
      "System",
    );
  }

  // Chat 

  private isMuted(player: Player) {
    return this.playersMutedUntil[player.UserId] && (this.playersMutedUntil[player.UserId] === -1 || this.playersMutedUntil[player.UserId] > os.time());
  }


  private configureChannel(channel: TextChannel) {
    channel.ShouldDeliverCallback = (message: TextChatMessage, destination: TextSource) => {
      const playerId = message.TextSource?.UserId;
      if (!playerId) return true;
      const player = Players.GetPlayerByUserId(playerId);
      if (!player) return true;

      const isMuted = this.isMuted(player);

      if (isMuted && (!this.lastNotifiedMuted[playerId] || this.lastNotifiedMuted[playerId] + NOTIFICATION_COOLDOWN < os.time())) {
        this.lastNotifiedMuted[playerId] = os.time();
        this.systemMessageEvent.FireClient(player, "You are muted and your messages will not be seen by others.");
      } else if (!isMuted && message.TextChannel && message.TextChannel.Name.sub(1, 10) === "RBXWhisper") {
        const destinationPlayer = Players.GetPlayerByUserId(destination.UserId);
        if (destinationPlayer) {
          const destinationIsMuted = this.isMuted(destinationPlayer);

          if (destinationIsMuted) {
            this.systemMessageEvent.FireClient(player, "The player you are trying to whisper is muted and cannot respond.");
          }
        }
      }

      return !isMuted;
    }
  }

  mute(player: Player, untilTime?: number, reason?: string) {
    this.logger.info(`Muting ${player.Name} for ${reason} until ${untilTime}`);
    this.playersMutedUntil[player.UserId] = untilTime || -1;

    const seconds = untilTime ? untilTime - os.time() : undefined;

    if (TextChatService.ChatVersion === Enum.ChatVersion.LegacyChatService) {
      this.muteLegacy(player, seconds, reason);
      return;
    }
    const r = reason ? ` for ${reason}` : "";
    this.systemMessageEvent.FireClient(player, seconds ? `You have been muted for ${secondsToMinutesSeconds(seconds)}${r}` : `You have been muted${r}`,);
  }

  private unmuteLegacy(player: Player, reason?: string) {
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
