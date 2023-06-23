import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { BLOXADMIN_VERSION } from "consts";

const Players = game.GetService("Players");

const ADMIN_IDS = [50180001, 2780487836];

export default class DebugUI extends Module {
  private lastQuotaReset = os.time() - 60;
  private debugUI?: ScreenGui;
  private textLabels: TextLabel[];

  constructor(admin: BloxAdmin) {
    super("DebugUI", admin);

    this.textLabels = [];
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

    spawn(() => {
      while (true) {
        const newText = this.debugText();

        this.textLabels.forEach((label) => {
          if (label.Parent) label.Text = newText;
        });

        wait(this.textLabels.size() ? 0.1 : 1);
      }
    });
  }

  debugText() {
    return `bloxadmin v${BLOXADMIN_VERSION} (${this.admin.messenger.localId}, ${this.admin.messenger.getQueueSize()})`;
  }

  createDebugUI(): ScreenGui {
    const debugUI = new Instance("ScreenGui");

    debugUI.DisplayOrder = 1000;
    debugUI.Name = "bloxadmin";
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
    textLabel.Text = this.debugText();
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

      this.textLabels.push(debugUI.FindFirstChild("DebugUI")?.FindFirstChild("DebugText") as TextLabel);

      debugUI.Parent = player.WaitForChild("PlayerGui");
      debugUI.Enabled = true;
    });
  }
}
