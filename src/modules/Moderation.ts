import { Module } from "Module";
import { BloxAdmin } from "BloxAdmin";
import { EventType } from "types";
import Datastore from "Datastore";
import { Players } from "@rbxts/services";

type Plr = Player | number;
type Invoker = Player | number | undefined;
type Reason = string | undefined;
type Duration = number | undefined;

type Events = {
  Report: [Plr, Invoker, Reason],
  Warn: [Plr, Invoker, Reason],
  Kick: [Plr, Invoker, Reason],
  Mute: [Plr, Invoker, Reason, Duration],
  Unmute: [Plr, Invoker, Reason]
  Ban: [Plr, Invoker, Reason, Duration],
  Unban: [Plr, Invoker, Reason],
};

type ModerationDatastore = Partial<{ [Key in "muted" | "banned" ]: { invoker: number | undefined, reason: Reason, expiry: number } }>;

export default class Moderation extends Module<Events> {
  private datastore: Datastore;
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
      delay: 5
    });

    this.mutes = new Map();
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
  };

  public Report(plr: Plr, invoker: Invoker, reason: Reason) {
    this.logger.debug(`Action: Report, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    this.dispatcher("Report", plr, invoker, reason);
  };

  public Warn(plr: Plr, invoker: Invoker, reason: Reason) {
    this.logger.debug(`Action: Warn, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    this.dispatcher("Warn", plr, invoker, reason);
  };

  public Kick(plr: Plr, invoker: Invoker, reason?: string) {
    this.logger.debug(`Action: Kick, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    const player = typeIs(plr, "number") ? Players.GetPlayerByUserId(plr) : plr;

    if (player) {
      if (this.admin.config.moderation.kick) {
        player.Kick(reason);
      };

      this.dispatcher("Kick", plr, invoker, reason);
    };
  };

  public Mute(plr: Plr, invoker: Invoker, reason: Reason, duration: Duration) {
    this.logger.debug(`Action: Mute, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}, Duration: ${duration}`);

    const invokerId = typeIs(invoker, "number") ? invoker : invoker?.UserId;
    const id = tostring(typeIs(plr, "number") ? plr : plr.UserId);
    const expiry = duration ? os.time() + duration : -1;

    this.datastore.update<ModerationDatastore>(id, (old) => {
      return { ...old, muted: { invoker: invokerId, reason, expiry } };
    });

    this.dispatcher("Mute", plr, invoker, reason, duration);
  };

  public Unmute(plr: Plr, invoker: Invoker, reason: Reason) {
    this.logger.debug(`Action: Unmute, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    const player = typeIs(plr, "number") ? Players.GetPlayerByUserId(plr) : plr;
    const id = tostring(plr);

    this.datastore.update<ModerationDatastore>(id, (old) => {
      if (old && old.muted) {
        delete old.muted;
      };

      return { ...old };
    });

    if (player) {
      this.mutes.delete(player.UserId);
    };

    this.dispatcher("Unmute", plr, invoker, reason);
  };

  public Ban(plr: Plr, invoker: Invoker, reason: Reason, duration: Duration) {
    this.logger.debug(`Action: Ban, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}, Duration: ${duration}`);

    const id = tostring(typeIs(plr, "number") ? plr : plr.UserId);
    const invokerId = typeIs(invoker, "number") ? invoker : invoker?.UserId;
    const expiry = duration ? os.time() + duration : -1;

    this.datastore.update<ModerationDatastore>(id, (old) => {
      return { ...old, banned: { invoker: invokerId, reason, expiry } };
    });

    const player = typeIs(plr, "number") ? Players.GetPlayerByUserId(plr) : plr;

    if (player) {
      if (this.admin.config.moderation.ban) {
        player.Kick(reason);
      };
    }

    this.dispatcher("Ban", plr, invoker, reason, duration);
  };

  public Unban(plr: Plr, invoker: Invoker, reason: Reason) {
    this.logger.debug(`Action: Unban, Player: ${plr}, Invoker ${invoker}, Reason: ${reason}`);

    const id = tostring(typeIs(plr, "number") ? plr : plr.UserId);

    this.datastore.update<ModerationDatastore>(id, (old) => {
      if (old && old.banned) {
        delete old.banned;
      };

      return { ...old };
    });

    this.dispatcher("Unban", plr, invoker, reason);
  };

  private check(plr: Player) {
    const id = tostring(plr.UserId);
    const result = this.datastore.get<ModerationDatastore>(id);

    if (result) {
      if (result.banned) {
        if (result.banned.expiry > os.time() || result.banned.expiry === -1) {
          if (this.admin.config.moderation.ban) {
            plr.Kick(result.banned.reason);
          };

          this.logger.debug(`Action: Ban Check, Player: ${plr}, Invoker ${result.banned.invoker}, Reason: ${result.banned.reason}, Expiry: ${result.banned.expiry}`);

          this.emit("Ban", plr.UserId, result.banned.invoker, result.banned.reason, result.banned.expiry === -1 ? -1 : os.time() - result.banned.expiry);
        } else {
          this.dispatch = false;

          this.Unban(plr.UserId, undefined, "Ban expired.");
        };
      };

      if (result.muted) {
        if (result.muted.expiry > os.time() || result.muted.expiry === -1) {
          if (result.muted.expiry > 0) {
            this.mutes.set(plr.UserId, result.muted.expiry);
          };

          this.logger.debug(`Action: Mute Check, Player: ${plr}, Invoker ${result.muted.invoker}, Reason: ${result.muted.reason}, Expiry: ${result.muted.expiry}`);

          this.emit("Mute", plr.UserId, result.muted.invoker, result.muted.reason, result.muted.expiry === -1 ? -1 : os.time() - result.muted.expiry);
        } else {
          this.dispatch = false;

          this.Unmute(plr.UserId, undefined, "Mute expired.");
        };
      };
    };
  };

  private lifecycle = (loop = true) => {
    for (const [plrId, expiry] of pairs(this.mutes)) {
      if (expiry < os.time()) {
        this.Unmute(plrId, undefined, "Mute expired.");
      };
    };

    if (loop) {
      task.delay(1, () => {
        this.lifecycle(true);
      });
    };
  };

  private dispatcher<Action extends keyof Events>(action: Action, ...args: Events[Action]) {
    const [plr, invoker, reason, duration] = args;

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

    this.emit(action, ...args);
  };
};
