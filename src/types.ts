export interface Profile {
  id: string;
  name: string;
  endpoint: string;
  apiKey?: string;
  model: string;
  prompt?: string;
}

export interface TranslateRequest {
  type: 'translate';
  texts: string[];
  profile: Profile;
}

export interface ToggleMessage {
  type: 'toggle-translation';
  profile: Profile;
}

export interface NotificationMessage {
  type: 'error' | 'status';
  message: string;
}

export type ContentMessage = ToggleMessage | NotificationMessage;

export interface TranslateResponse {
  ok: boolean;
  translations?: string[];
  error?: string;
}
