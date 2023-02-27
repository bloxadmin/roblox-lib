import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { EventType } from "types";

const Players = game.GetService("Players");
const TeleportService = game.GetService("TeleportService");

export default class Actions extends Module {
  constructor(admin: BloxAdmin) {
    super("Actions", admin);
  }

  enable(): void {}
}
