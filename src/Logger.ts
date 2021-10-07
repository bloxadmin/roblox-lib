export enum LoggerLevel {
  None,
  Info,
  Warning,
  Error,
  Debug,
}

// Logger class with prefix and sub loggers
export default class Logger {
  private name: string;
  level: LoggerLevel;

  constructor(name: string, level = LoggerLevel.None) {
    this.name = name;
    this.level = level;
  }

  public info(...msgs: string[]) {
    this.log(LoggerLevel.Info, ...msgs);
  }

  public warn(...msgs: string[]) {
    this.log(LoggerLevel.Warning, ...msgs);
  }

  public error(...msgs: string[]) {
    this.log(LoggerLevel.Error, ...msgs);
  }

  public debug(...msgs: string[]) {
    this.log(LoggerLevel.Debug, ...msgs);
  }

  public log(level: LoggerLevel, ...msgs: string[]) {
    let levelName = "";
    switch (level) {
      case LoggerLevel.Warning:
        levelName = "WARN";
        break;
      case LoggerLevel.Error:
        levelName = "ERROR";
        break;
      case LoggerLevel.Debug:
        levelName = "DEBUG";
        break;
      default:
        levelName = "INFO";
        break;
    }
    if (this.level >= level) {
      const message = msgs.map((msg) => tostring(msg)).join(" ");
      print(`[${this.name}] <${levelName}> ${message}`);
    }
  }

  public sub(name: string) {
    return new Logger(`${this.name}/${name}`);
  }
}
