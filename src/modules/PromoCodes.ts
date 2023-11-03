import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";

const HttpService = game.GetService("HttpService");
const Players = game.GetService("Players");

export interface CreatePromoCode {
  attributes: Record<string, unknown>;
  uses?: number;
  active: boolean;
  starts?: string;
  expires?: string;
}

export interface PromoCode extends CreatePromoCode {
  code: string;
  used: number;
  created: string;
}


export default class PromoCodes extends Module<{ "codeClaimed": [Player, string, PromoCode] }> {
  public CodeClaimed = this.getSignal("codeClaimed");

  constructor(admin: BloxAdmin) {
    super("PromoCodes", admin);
  }

  enable(): void { }

  ClaimCode(player: Player | number, code: string): Promise<PromoCode> {
    return new Promise((resolve, reject) => {
      const user = typeIs(player, "number") ? Players.GetPlayerByUserId(player) : player;
      const playerId = typeIs(player, "number") ? player : player.UserId;

      const url = `${this.admin.config.api.base}/games/${game.GameId}/codes/${code}/uses/${playerId}`

      this.logger.debug("PUT to " + url);

      const response = this.admin.messenger.put(url, {
        serverId: this.admin.serverId(),
      });

      if (!response.Success) {
        return reject(response.Body);
      }

      const promoCode = HttpService.JSONDecode(response.Body) as PromoCode;

      if (user)
        this.emit("codeClaimed", user, code, promoCode);

      return resolve(promoCode);
    });
  }
}
