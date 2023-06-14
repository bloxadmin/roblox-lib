import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { EventType } from "types";

export enum MetricsEventType {
  Set = 0,
  Merge = 1,
  Add = 2,
  Time = 3,
  Score = 4,
}

export type MetricsEvent = [EventType.Metrics, MetricsEventType, number, string, number, ...([number] | [number, number, number, number])];

export default class Metrics extends Module {
  constructor(admin: BloxAdmin) {
    super("Metrics", admin);
  }

  enable(): void {
  }

  private send(event: MetricsEvent): void {
    this.admin.messenger.sendRemote(event);
  }

  private playerId(player: Player | number): number {
    return typeIs(player, "number") ? player : player.UserId;
  }

  private buildEvent(
    eventType: MetricsEventType, name: string, player: Player | number,
    ...args: [number] | [number, number, number, number]
  ): MetricsEvent {
    return [EventType.Metrics, eventType, os.time(), name, this.playerId(player), ...args]
  }

  set(player: Player | number, name: string, value: number): void {
    this.send(this.buildEvent(MetricsEventType.Set, name, player, value));
  }

  merge(player: Player | number, name: string, data: {
    min: number;
    max: number;
    sum: number;
    count: number;
  }): void {
    this.send(this.buildEvent(MetricsEventType.Merge, name, player, data.min, data.max, data.sum, data.count));
  }

  add(player: Player | number, name: string, value: number): void {
    this.send(this.buildEvent(MetricsEventType.Add, name, player, value));
  }

  time(player: Player | number, name: string, value: number): void {
    this.send(this.buildEvent(MetricsEventType.Time, name, player, value));
  }

  score(player: Player | number, name: string, value: number): void {
    this.send(this.buildEvent(MetricsEventType.Score, name, player, value));
  }
}
