export type AutoIntervalEvents = "stats" | "playerPosition" | "memoryStoreServiceQuotaUsage";
export type MarketplaceEvents =
  | "marketplaceBundlePurchaseFinished"
  | "marketplaceGamePassPurchaseFinished"
  | "marketplacePremiumPurchaseFinished"
  | "marketplacePromptPurchaseFinished"
  | "marketplaceThirdPartyPurchaseFinished"
  | "marketplaceProductPurchaseFinished"
  | "marketplaceProcessReceipt";
export type AutoPlayerEvents = MarketplaceEvents | "playerJoin" | "playerLeave" | "playerReady" | "playerChat";
export type AutoEvents =
  | AutoIntervalEvents
  | AutoPlayerEvents
  | "serverOpen"
  | "serverClose"
  | "consoleLog"
  | "scriptError";
export type CustomPlayerEvents = "playerTextInput" | "playerTrigger" | "playerLocationTrigger";
export type CustomEvents = CustomPlayerEvents | "trigger" | "locationTrigger";
export type Event = AutoEvents | CustomEvents;

export interface Config {
  api: {
    base: string;
    loggingLevel: Enum.AnalyticsLogLevel;
    loggingHandlers:
    | {
      [key: string]: Enum.AnalyticsLogLevel;
    }
    | undefined;
    DEBUGGING_ONLY_runInStudio: boolean;
  };
  events: {
    disableIntervals: boolean;
    disablePlayer: boolean;
    disableAuto: boolean;
    disableAutoPlayer: boolean;
    disableCustomPlayer: boolean;
    disableCustom: boolean;
    disablePlayerText: boolean;
    disableText: boolean;
    disablePlayerlocation: boolean;
    disableLocation: boolean;
    disableMarketplace: boolean;
    disallow: Event[];
  };
  intervals: {
    ingest: number;
    ingestRetry: number;
    stats: number;
    heartbeat: number;
    playerPositions: number;
    playerCursors: number;
  };
}

export interface InitConfig {
  api?: Partial<Config["api"]>;
  events?: Partial<Config["events"]>;
  intervals?: Partial<Config["intervals"]>;
}

export enum EventType {
  ConsoleLog = 0,
  Analytics = 1,
  RemoteConfig = 2,
  Actions = 3,
  Moderation = 4,
  Shutdown = 5,
  Chat = 6,
  Metrics = 7,
}

export interface ScriptErrorData {
  message: string,
  stack: string,
  script?: string
};

export interface PlayerReadyData {
  input: {
    accelerometerEnabled: boolean;
    gamepadEnabled: boolean;
    gyroscopeEnabled: boolean;
    keyboardEnabled: boolean;
    mouseSensitivity: number;
    mouseEnabled: boolean;
    mouseIconEnabled: boolean;
    touchEnabled: boolean;
    vrEnabled: boolean;
  };
  settings: {
    computerCameraMovementMode: number;
    computerMovementMode: number;
    controlMode: number;
    gamepadCameraSensitivity: number;
    mouseSenitivity: number;
    savedQualityLevel: number;
    touchCameraMovementMode: number;
    touchMovementMode: number;
    inFullscreen: boolean;
    inStudio: boolean;
  };
  camera?: {
    viewportSize: [number, number];
    fov: number;
  };
  gui: {
    isTenFootInterface: boolean;
  };
  localization: {
    countryCode: string;
  };
  policy: PolicyInfo;
}

export enum MessageType {
  Default = "Message",
  System = "System",
  MeCommand = "MeCommand",
  Welcome = "Welcome",
  SetCore = "SetCore",
  Whisper = "Whisper",
}

export type ChatExtraData = unknown;

export interface ChatMessage {
  ID: string;
  FromSpeaker: string;
  SpeakerDisplayName: string;
  SpeakerUserId: number;
  OriginalChannel: string;
  MessageLength: number;
  MessageLengthUtf8: number;
  MessageType: MessageType;
  IsFiltered: boolean;
  Message: string;
  FilterResult?: string;
  IsFilterResult?: boolean;
  Time: number;
  ExtraData: ChatExtraData;
}

export interface ChatChannel {
  ChatService: ChatService;

  Name: string;
  WelcomeMessage: string;
  GetWelcomeMessageFunction: unknown;
  ChannelNameColor: Color3;

  Joinable: boolean;
  Leavable: boolean;
  AutoJoin: boolean;
  Private: boolean;

  Speakers: ChatSpeaker[];
  Mutes: ChatSpeaker[];

  MaxHistory: number;
  HistoryIndex: number;
  ChatHistory: unknown[];

  FilterMessageFunctions: unknown[];
  ProcessCommandsFunctions: unknown[];

  eDestroyed: BindableEvent;
  eMessagePosted: BindableEvent;
  eSpeakerJoined: BindableEvent;
  eSpeakerLeft: BindableEvent;
  eSpeakerMuted: BindableEvent;
  eSpeakerUnmuted: BindableEvent;

  MessagePosted: RBXScriptSignal<(message: unknown) => void>;
  SpeakerJoined: RBXScriptSignal<(name: string) => void>;
  SpeakerLeft: RBXScriptSignal<(name: string) => void>;
  SpeakerMuted: RBXScriptSignal<(name: string, reason: string, length: number) => void>;
  SpeakerUnmuted: RBXScriptSignal<(name: string) => void>;
  Destroyed: RBXScriptSignal<() => void>;

  SendSystemMessage(message: string, extraData?: ChatExtraData): void;
  SendSystemMessageToSpeaker(speaker: ChatSpeaker, message: string, extraData?: ChatExtraData): void;
  CanCommunicateByUserId(userId1: number, userId2: number): boolean;
  CanCommunicate(speaker1: Speaker, speaker2: Speaker): boolean;
  SendMessageToSpeaker(message: string, name: string, from: string, extraData?: ChatExtraData): void;
  KickSpeaker(name: string, reason?: string): void;
  MuteSpeaker(name: string, reason?: string, length?: number): void;
  UnmuteSpeaker(name: string): void;
  IsSpeakerMuted(name: string): boolean;
  GetSpeakerList(): ChatSpeaker[];
  GetHistoryLog(): ChatMessage[];
  GetHistoryLogForSpeaker(name: string): ChatMessage[];
}

export interface ChatSpeaker {
  ChatService: ChatService;
  PlayerObj: Player;
  Name: string;
  ExtraData: ChatExtraData;
  Channels: ChatChannel[];
  MutedSpeakers: ChatSpeaker[];
  EventFolder: Folder;

  SayMessage(message: string, channelName: string, extraData?: ChatExtraData): void;
  JoinChannel(name: string): void;
  LeaveChannel(name: string): void;
  IsInChannel(name: string): boolean;
  GetChannelList(): string[];
  SendMessage(message: string, channelName: string, from: string, extraData?: ChatExtraData): void;
  SendSystemMessage(message: string, channelName: string, extraData?: ChatExtraData): void;
  GetPlayer(): Player;
  GetNameForDisplay(): string;
  SetExtraData(data: ChatExtraData): void;
  GetExtraData(): ChatExtraData;
  SetMainChannel(name: string): void;
  AddMutedSpeaker(speaker: ChatSpeaker): void;
  RemoveMutedSpeaker(speaker: ChatSpeaker): void;
  IsSpeakerMuted(speaker: ChatSpeaker): boolean;
  UpdateChannelNameColor(name: string, color: Color3): void;
}

export interface ChatService {
  MessageIdCounter: number;
  ChatChannels: ChatChannel[];
  Speakers: ChatSpeaker[];

  FilterMessageFunctions: MessageType;
  ProcessCommandsFunctions: unknown[];

  eChannelAdded: BindableEvent;
  eChannelRemoved: BindableEvent;
  eSpeakerAdded: BindableEvent;
  eSpeakerRemoved: BindableEvent;

  ChannelAdded: RBXScriptSignal<(channel: ChatChannel) => void>;
  ChannelRemoved: RBXScriptSignal<(channel: ChatChannel) => void>;
  SpeakerAdded: RBXScriptSignal<(speaker: ChatSpeaker) => void>;
  SpeakerRemoved: RBXScriptSignal<(speaker: ChatSpeaker) => void>;

  ChatServiceMajorVersion: number;
  ChatServiceMinorVersion: number;

  AddChannel(name: string, autoJoin: boolean): ChatChannel;
  RemoveChannel(name: string): void;
  GetChannel(name: string): ChatChannel | undefined;
  AddSpeaker(name: string): ChatSpeaker;
  RemoveSpeaker(name: string): void;
  GetSpeaker(name: string): ChatSpeaker | undefined;
  GetSpeakerByUserOrDisplayName(name: string): ChatSpeaker | undefined;
  GetChannelList(): ChatChannel[];
  GetAutoJoinChannelList(): ChatChannel[];
  GetSpeakerList(): ChatSpeaker[];
  SendGlobalSystemMessage(message: string): void;
}
