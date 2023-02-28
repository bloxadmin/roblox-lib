import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { EventType } from "types";

const HttpService = game.GetService("HttpService");
const Players = game.GetService("Players");
const TeleportService = game.GetService("TeleportService");

export enum ActionEventType {
  Call = 0,
  Running = 1,
  Result = 2,
}

export interface ActionCall {
  name: string;
  id: string;
  context: Record<string, unknown>;
  parameters: Record<string, unknown>;
  returns: Record<string, unknown>;
}

export type ActionCallback = (context: ActionCall) => Record<string, unknown> | void;

export default class Actions extends Module {
  private readonly watchers: Record<string, ActionCallback[]>;

  constructor(admin: BloxAdmin) {
    super("Actions", admin);

    this.watchers = {
      "*": [],
    };
  }

  enable(): void {
    this.admin.messenger.on("message", (data) => {
      const [eventType, actionEventType, event] = data;
      this.logger.info(`Received event type ${eventType} - ${actionEventType}`);
      if (eventType !== EventType.Actions) return;

      this.logger.debug(`Received event ${actionEventType}`);
      this.logger.verbose(`Event data: ${HttpService.JSONEncode(event)}`);

      switch (actionEventType) {
        case ActionEventType.Call: {
          const eventData = event as {
            name: string;
            id: string;
            context: Record<string, unknown>;
            parameters: Record<string, unknown>;
          };

          if (!this.canCall(eventData.name)) return;

          this.admin.messenger.sendRemote([EventType.Actions, ActionEventType.Running, eventData.id]).then(() => {
            const returns = this.call(eventData);

            this.admin.messenger.sendRemote([EventType.Actions, ActionEventType.Result, eventData.id, returns]);
          });
        }
      }
    });
  }

  canCall(name: string) {
    return !!(this.watchers[name] || this.watchers["*"]);
  }

  getWatchers(name: string): ActionCallback[] {
    return [...(this.watchers[name] || []), ...(this.watchers["*"] || [])];
  }

  call({
    name,
    id,
    context,
    parameters,
  }: {
    name: string;
    id: string;
    context: Record<string, unknown>;
    parameters: Record<string, unknown>;
  }): Record<string, unknown> {
    this.logger.debug(`Calling action ${name}`);

    const watchers = this.getWatchers(name);

    if (!watchers) return {};

    const returns: Record<string, unknown> = {};

    watchers.forEach((watcher) => {
      try {
        const result = watcher({
          name,
          id,
          context,
          parameters,
          returns,
        });

        if (result && typeOf(result) === "table") {
          // eslint-disable-next-line roblox-ts/no-array-pairs
          for (const [key, value] of pairs(result)) {
            returns[key] = value;
          }
        }
      } catch (e) {
        this.logger.error(`Error in watcher for action ${name}`);
        this.logger.error(tostring(e));
      }
    });

    this.logger.debug(`Action ${name} done`);
    this.logger.verbose(`Action ${name} returned ${HttpService.JSONEncode(returns)}`);

    return returns;
  }

  watch(name: string, callback: ActionCallback) {
    if (!this.watchers[name]) this.watchers[name] = [];

    this.watchers[name].push(callback);

    return {
      _Actions: this,
      _Callback: callback,
      Connected: true,
      Disconnect() {
        this.Connected = false;
        this._Actions.unwatch(name, this._Callback);
      },
    };
  }

  unwatch(name: string, callback: ActionCallback): void {
    if (!this.watchers[name]) return;

    const index = this.watchers[name].indexOf(callback);
    if (index !== -1) this.watchers[name].remove(index);
  }
}
