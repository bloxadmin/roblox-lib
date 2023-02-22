import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { ChatChannel, ChatService, EventType } from "types";

const Players = game.GetService("Players");
const ChatService = require(game
  .GetService("ServerScriptService")
  ?.WaitForChild("ChatServiceRunner", 10)
  ?.WaitForChild("ChatService", 10) as ModuleScript) as ChatService | undefined;

export enum ModerationType {
  Kick = "kick",
  Mute = "mute",
  Unmute = "unmute",
}

function secondsToMinutesSeconds(seconds: number) {
  const minutes = math.floor(seconds / 60);
  const secondsLeft = seconds % 60;
  if (minutes > 0) {
    if (secondsLeft === 0) return `${minutes} minutes`;

    return `${minutes} minutes and ${secondsLeft} seconds`;
  }
  return `${secondsLeft} seconds`;
}

export default class Moderation extends Module<{
  kick: [Player, string];
  ban: [Player, number, string];
  unban: [Player, string];
  mute: [Player, number, string];
  unmute: [Player, string];
}> {
  constructor(admin: BloxAdmin) {
    super("Moderation", admin);
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
  }

  kick(player: Player, reason?: string) {
    this.logger.info(`Kicking ${player.Name} for ${reason}`);
    player.Kick(reason);
  }

  mute(player: Player, untilTime?: number, reason?: string) {
    this.logger.info(`Muting ${player.Name} for ${reason} until ${untilTime}`);

    const seconds = untilTime ? untilTime - os.time() : undefined;

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

  unmute(player: Player, reason?: string) {
    this.logger.info(`Unmuting ${player.Name} for ${reason}`);

    if (!ChatService) return;

    const speaker = ChatService.GetSpeaker(player.Name);
    speaker?.GetChannelList()?.forEach((channelName) => {
      const channel = ChatService.GetChannel(channelName);
      if (!channel || !channel.IsSpeakerMuted(speaker.Name)) return;

      channel.UnmuteSpeaker(speaker.Name);
    });
    speaker?.SendSystemMessage("You have been unmuted.", "System");
  }
}
