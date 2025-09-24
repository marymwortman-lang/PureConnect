export interface SignalingMessage {
  type: 'join' | 'joined' | 'offer' | 'answer' | 'candidate' | 'error';
  roomId?: string;
  clients?: number;
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
}

export enum CallState {
  IDLE = 'IDLE',
  JOINING = 'JOINING',
  CONNECTED = 'CONNECTED',
}
