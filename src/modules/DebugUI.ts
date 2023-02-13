import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { BLOXADMIN_VERSION } from "consts";

const Players = game.GetService("Players");

const ADMIN_IDS = [50180001, 2780487836];

export default class DebugUI extends Module {
  private debugUI?: ScreenGui;

  constructor(admin: BloxAdmin) {
    super("DebugUI", admin);
  }

  enable(): void {
    this.debugUI = this.createDebugUI();

    Players.PlayerAdded.Connect((player) => {
      if (!ADMIN_IDS.includes(player.UserId)) return;

      this.givePlayerDebugUI(player);
    });

    Players.GetPlayers().forEach((player) => {
      if (!ADMIN_IDS.includes(player.UserId)) return;

      this.givePlayerDebugUI(player);
    });
  }

  createDebugUI(): ScreenGui {
    const debugUI = new Instance("ScreenGui");

    debugUI.DisplayOrder = 1000;
    debugUI.Name = "BloxAdmin";
    debugUI.Enabled = false;

    const frame = new Instance("Frame");
    frame.Name = "DebugUI";
    frame.AnchorPoint = new Vector2(0, 1);
    frame.Position = new UDim2(0, 4, 1, 0);
    frame.Size = new UDim2(0, 200, 0, 16);
    frame.BackgroundTransparency = 1;
    frame.BorderSizePixel = 0;

    const textLabel = new Instance("TextLabel");
    textLabel.Name = "DebugText";
    textLabel.TextXAlignment = Enum.TextXAlignment.Left;
    textLabel.Size = new UDim2(0, 200, 0, 16);
    textLabel.BackgroundTransparency = 1;
    textLabel.BorderSizePixel = 0;
    textLabel.Text = "BloxAdmin v" + BLOXADMIN_VERSION;
    textLabel.TextColor3 = Color3.fromRGB(255, 255, 255);
    textLabel.TextSize = 8;

    textLabel.Parent = frame;
    frame.Parent = debugUI;
    return debugUI;
  }

  givePlayerDebugUI(player: Player): void {
    spawn(() => {
      this.logger.info(`Giving player debug UI: ${player.DisplayName} (${player.UserId})`);

      const debugUI = this.debugUI?.Clone();
      if (!debugUI) return;

      debugUI.Parent = player.WaitForChild("PlayerGui");
      debugUI.Enabled = true;
    });
  }
}
