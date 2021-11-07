import { BloxAdmin } from "BloxAdmin";
import Logger from "Logger";

export abstract class Module {
  name: string;
  admin: BloxAdmin;
  logger: Logger;

  constructor(name: string, admin: BloxAdmin) {
    this.name = name;
    this.admin = admin;
    this.logger = this.admin.logger.sub(name);
  }

  abstract enable(): void;
}
