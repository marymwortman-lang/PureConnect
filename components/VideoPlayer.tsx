import React, { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  stream: MediaStream | null;
  isMuted?: boolean;
  isLocal?: boolean;
  isVideoEnabled?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ stream, isMuted = false, isLocal = false, isVideoEnabled = true }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  
  const containerClasses = isLocal
    ? "absolute bottom-5 right-5 w-48 h-36 md:w-64 md:h-48 z-10 transition-all duration-300"
    : "relative w-full h-full flex items-center justify-center bg-slate-800";
    
  const videoClasses = isLocal
    ? "w-full h-full object-cover rounded-lg shadow-2xl border-2 border-slate-700"
    : "w-full h-full object-contain";

  return (
    <div className={containerClasses}>
      <video ref={videoRef} autoPlay playsInline muted={isMuted} className={videoClasses} style={{ transform: isLocal ? 'scaleX(-1)' : 'none', display: isVideoEnabled ? 'block': 'none' }} />
      {!isVideoEnabled && (
         <div className="w-full h-full flex items-center justify-center bg-slate-700 rounded-lg">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
             <circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
           </svg>
         </div>
      )}
    </div>
  );
};

export default VideoPlayer;
