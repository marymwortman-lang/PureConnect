import React, { useState, useRef, useCallback, useEffect } from 'react';
import Lobby from './components/Lobby';
import VideoPlayer from './components/VideoPlayer';
import CallControls from './components/CallControls';
import { CallState, SignalingMessage } from './types';

const App: React.FC = () => {
  const [callState, setCallState] = useState<CallState>(CallState.IDLE);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const signalingRef = useRef<WebSocket | null>(null);

  const signalingServerUrl = 'ws://localhost:3001'; // Default signaling server
  const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const hangUp = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (signalingRef.current) {
      signalingRef.current.close();
      signalingRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setRemoteStream(null);
    setCallState(CallState.IDLE);
    setIsMuted(false);
    setIsVideoEnabled(true);
  }, []);

  const createPeerConnection = useCallback((roomId: string) => {
    const pc = new RTCPeerConnection(iceServers);

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingRef.current) {
        const message: SignalingMessage = { type: 'candidate', payload: event.candidate.toJSON() };
        signalingRef.current.send(JSON.stringify(message));
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };
    
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            hangUp();
        }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
    }

    pcRef.current = pc;
  }, [hangUp]);

  const handleJoin = useCallback(async (roomId: string) => {
    setCallState(CallState.JOINING);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      
      signalingRef.current = new WebSocket(signalingServerUrl);
      
      signalingRef.current.onopen = () => {
        const joinMessage: SignalingMessage = { type: 'join', roomId };
        signalingRef.current?.send(JSON.stringify(joinMessage));
      };
      
      signalingRef.current.onmessage = async (event) => {
        const msg: SignalingMessage = JSON.parse(event.data);

        if (!pcRef.current) createPeerConnection(roomId);
        
        switch (msg.type) {
          case 'joined':
            setCallState(CallState.CONNECTED);
            if (msg.clients && msg.clients > 1) {
              const offer = await pcRef.current?.createOffer();
              await pcRef.current?.setLocalDescription(offer);
              const offerMessage: SignalingMessage = { type: 'offer', payload: offer };
              signalingRef.current?.send(JSON.stringify(offerMessage));
            }
            break;
          case 'offer':
            if (msg.payload) {
              await pcRef.current?.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
              const answer = await pcRef.current?.createAnswer();
              await pcRef.current?.setLocalDescription(answer);
              const answerMessage: SignalingMessage = { type: 'answer', payload: answer };
              signalingRef.current?.send(JSON.stringify(answerMessage));
            }
            break;
          case 'answer':
            if (msg.payload) {
              await pcRef.current?.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
            }
            break;
          case 'candidate':
            if (msg.payload) {
              await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit));
            }
            break;
        }
      };

      signalingRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        hangUp();
      };

      signalingRef.current.onclose = () => {
        // Only hang up if we were in a connected state
        if (callState !== CallState.IDLE) {
          hangUp();
        }
      }

    } catch (error) {
      console.error('Error joining call:', error);
      alert('Could not start call. Please check camera/microphone permissions.');
      setCallState(CallState.IDLE);
    }
  }, [createPeerConnection, hangUp, callState]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (callState !== CallState.IDLE) {
          hangUp();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
        });
        setIsMuted(prev => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
            track.enabled = !track.enabled;
        });
        setIsVideoEnabled(prev => !prev);
    }
  };

  // FIX: This condition was updated to correctly show the Lobby while the call state is JOINING.
  // The previous logic (`callState !== CallState.CONNECTED && callState !== CallState.JOINING`)
  // was equivalent to `callState === CallState.IDLE`, which incorrectly hid the lobby
  // during the joining phase.
  if (callState !== CallState.CONNECTED) {
    return <Lobby onJoin={handleJoin} isJoining={callState === CallState.JOINING} />;
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-900">
        <VideoPlayer stream={remoteStream} />
        <VideoPlayer stream={localStreamRef.current} isLocal isMuted isVideoEnabled={isVideoEnabled} />
        <CallControls 
            onHangUp={hangUp}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            isVideoEnabled={isVideoEnabled}
            onToggleVideo={toggleVideo}
        />
    </main>
  );
};

export default App;