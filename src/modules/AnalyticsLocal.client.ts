import { PlayerReadyData, ScriptErrorData } from "types";

const Workspace = game.GetService("Workspace");
const ReplicatedStorage = game.GetService("ReplicatedStorage");
const UserInputService = game.GetService("UserInputService");
const UserGameSettings = UserSettings().GetService("UserGameSettings");
const GuiService = game.GetService("GuiService");
const LocalizationService = game.GetService("LocalizationService");
const PolicyService = game.GetService("PolicyService");
const Players = game.GetService("Players");
const ScriptContext = game.GetService("ScriptContext");

const scriptErrorEvent = ReplicatedStorage.WaitForChild("BloxAdminEvents").WaitForChild(
  "ScriptErrorEvent"
) as RemoteEvent<(data: ScriptErrorData) => void>;

const playerReadyEvent = ReplicatedStorage.WaitForChild("BloxAdminEvents").WaitForChild(
  "AnalyticsPlayerReadyEvent",
) as RemoteEvent<(data: PlayerReadyData) => void>;

ScriptContext.Error.Connect((message, stack, sk) => {
  scriptErrorEvent.FireServer({ enviroment: "client", error: { message, stack, script: sk }, player: Players.LocalPlayer });
});

delay(3, () => {
  const CurrentCamera = Workspace.CurrentCamera;

  const player = Players.LocalPlayer;

  const data: PlayerReadyData = {
    input: {
      accelerometerEnabled: UserInputService.AccelerometerEnabled,
      gamepadEnabled: UserInputService.GamepadEnabled,
      gyroscopeEnabled: UserInputService.GyroscopeEnabled,
      keyboardEnabled: UserInputService.KeyboardEnabled,
      mouseSensitivity: UserGameSettings.MouseSensitivity,
      mouseEnabled: UserInputService.MouseEnabled,
      mouseIconEnabled: UserInputService.MouseIconEnabled,
      touchEnabled: UserInputService.TouchEnabled,
      vrEnabled: UserInputService.VREnabled,
    },
    settings: {
      computerCameraMovementMode: UserGameSettings.ComputerCameraMovementMode?.Value,
      computerMovementMode: UserGameSettings.ComputerMovementMode?.Value,
      controlMode: UserGameSettings.ControlMode?.Value,
      gamepadCameraSensitivity: UserGameSettings.GamepadCameraSensitivity,
      inFullscreen: UserGameSettings.InFullScreen(),
      inStudio: UserGameSettings.InStudioMode(),
      mouseSenitivity: UserGameSettings.MouseSensitivity,
      savedQualityLevel: UserGameSettings.SavedQualityLevel?.Value,
      touchCameraMovementMode: UserGameSettings.TouchCameraMovementMode?.Value,
      touchMovementMode: UserGameSettings.TouchMovementMode?.Value,
    },
    camera: CurrentCamera
      ? {
          fov: CurrentCamera.FieldOfView,
          viewportSize: [CurrentCamera.ViewportSize.X, CurrentCamera.ViewportSize.Y],
        }
      : undefined,
    gui: {
      isTenFootInterface: GuiService.IsTenFootInterface(),
    },
    localization: {
      countryCode: LocalizationService.GetCountryRegionForPlayerAsync(player),
    },
    policy: PolicyService.GetPolicyInfoForPlayerAsync(player),
  };

  playerReadyEvent.FireServer(data);
});
