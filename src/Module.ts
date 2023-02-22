import { BloxAdmin } from "BloxAdmin";
import EventEmitter, { Events } from "EventEmitter";
import Logger from "Logger";

export abstract class Module<E extends Events = {}> extends EventEmitter<E> {
  name: string;
  admin: BloxAdmin;
  logger: Logger;

  constructor(name: string, admin: BloxAdmin) {
    super();
    this.name = name;
    this.admin = admin;
    this.logger = this.admin.logger.sub(name);
  }

  abstract enable(): void;
}
