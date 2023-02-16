import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { EventType } from "types";

const Players = game.GetService("Players");
const TeleportService = game.GetService("TeleportService");

export default class Shutdown extends Module {
  constructor(admin: BloxAdmin) {
    super("Shutdown", admin);
  }

  enable(): void {
    this.admin.messenger.on("message", (data) => {
      const [eventType, inputReason, toPlace] = data;
      if (eventType !== EventType.Shutdown) return;

      let reason: string;
      if (!inputReason) {
        reason = "Requested by the developer";
      } else if (typeIs(inputReason, "string")) {
        reason = inputReason;
      } else {
        reason = tostring(inputReason);
      }

      let placeId: number | undefined = undefined;
      if (toPlace) {
        if (typeIs(toPlace, "number")) {
          placeId = toPlace;
        } else {
          placeId = tonumber(toPlace);
        }
      }

      this.shutdown(reason, placeId);
    });
  }

  shutdown(reason: string, placeId?: number) {
    this.admin.logger.info(`Shutdown requested: ${reason}`);

    const players = Players.GetPlayers();
    if (placeId && players.size() > 0 && players.size() <= 50) {
      TeleportService.TeleportPartyAsync(placeId, players, {
        "bloxadmin.com": "Server shutdown with teleport",
        ShutdownReason: reason,
        SourcePlaceId: game.PlaceId,
        SourceServer: game.JobId,
      } as unknown as TeleportData);

      return;
    }

    const kickMessage = `Server shutdown: ${reason}`;

    players.forEach((player) => player.Kick(kickMessage));
  }
}
