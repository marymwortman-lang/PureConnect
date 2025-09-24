import React from 'react';
import { MicOnIcon, MicOffIcon, VideoOnIcon, VideoOffIcon, PhoneHangupIcon } from './Icons';

interface CallControlsProps {
  isMuted: boolean;
  isVideoEnabled: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onHangUp: () => void;
}

const ControlButton: React.FC<{ onClick: () => void; className?: string; children: React.ReactNode }> = ({ onClick, className, children }) => (
    <button
        onClick={onClick}
        className={`p-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 ${className}`}
    >
        {children}
    </button>
);


const CallControls: React.FC<CallControlsProps> = ({ isMuted, isVideoEnabled, onToggleMute, onToggleVideo, onHangUp }) => {
  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center justify-center gap-4 bg-slate-800/80 backdrop-blur-sm p-3 rounded-full shadow-lg border border-slate-700">
        <ControlButton onClick={onToggleMute} className={isMuted ? "bg-red-500 text-white" : "bg-slate-700 text-slate-100 hover:bg-slate-600"}>
            {isMuted ? <MicOffIcon className="w-6 h-6" /> : <MicOnIcon className="w-6 h-6" />}
        </ControlButton>

        <ControlButton onClick={onToggleVideo} className={!isVideoEnabled ? "bg-red-500 text-white" : "bg-slate-700 text-slate-100 hover:bg-slate-600"}>
            {!isVideoEnabled ? <VideoOffIcon className="w-6 h-6" /> : <VideoOnIcon className="w-6 h-6" />}
        </ControlButton>
        
        <ControlButton onClick={onHangUp} className="bg-red-600 text-white hover:bg-red-700">
            <PhoneHangupIcon className="w-6 h-6 transform rotate-[135deg]" />
        </ControlButton>
      </div>
    </div>
  );
};

export default CallControls;
