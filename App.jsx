import React, { useEffect, useRef, useState, useCallback } from 'react';

// Enhanced App component with UI/UX improvements and features
export default function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null); // Still keeping for 1:1, for multi-peer this would be an array/map
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const localStreamRef = useRef(null);

  const [roomId, setRoomId] = useState(''); // Allow user to set room ID
  const [userName, setUserName] = useState(''); // User's name
  const [inLobby, setInLobby] = useState(true); // Pre-call lobby state
  const [inCall, setInCall] = useState(false); // In-call state
  const [isMuted, setIsMuted] = useState(false); // Audio mute state
  const [isVideoOff, setIsVideoOff] = useState(false); // Video off state
  const [status, setStatus] = useState('Welcome!'); // General status messages
  const [remotePeerName, setRemotePeerName] = useState('Remote User'); // Name of the connected peer
  const [chatMessages, setChatMessages] = useState([]); // Store chat messages
  const [currentChatMessage, setCurrentChatMessage] = useState(''); // Input for new chat message
  const chatBoxRef = useRef(null); // Ref for scrolling chat messages

  // Basic STUN servers; replace/add TURN for production
  // For production, you definitely want to include TURN servers for NAT traversal
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
    ]
  };

  // Cleanup function for disconnecting
  const cleanup = useCallback(() => {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (e) { console.error("Error closing PC:", e); }
      pcRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) { console.error("Error closing WS:", e); }
      wsRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setInCall(false);
    setInLobby(true);
    setIsMuted(false);
    setIsVideoOff(false);
    setRemotePeerName('Remote User');
    setChatMessages([]);
    setStatus('Call ended');
  }, []);

  useEffect(() => {
    // Generate a default room ID if none exists
    if (!roomId) {
      setRoomId(`room-${Math.random().toString(36).substring(2, 9)}`);
    }
    // Generate a default username
    if (!userName) {
      setUserName(`Guest-${Math.floor(Math.random() * 1000)}`);
    }

    return () => {
      cleanup();
    };
  }, [cleanup, roomId, userName]); // Added roomId and userName to dependency array for default generation

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatMessages]);

  async function startLocalStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setStatus('Local stream ready');
      return stream;
    } catch (e) {
      console.error('getUserMedia error', e);
      setStatus('Error: Could not access camera/microphone. Please allow permissions.');
      alert('Could not access camera/microphone. Please allow permissions.');
      throw e;
    }
  }

  function connectSignaling() {
    setStatus('Connecting to signaling server...');
    wsRef.current = new WebSocket('ws://localhost:3001');

    wsRef.current.onopen = () => {
      setStatus('Connected to signaling server. Joining room...');
      wsRef.current.send(JSON.stringify({ type: 'join', room: roomId, userName: userName }));
    };

    wsRef.current.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data);

        switch (data.type) {
          case 'joined':
            setStatus(`Joined room '${roomId}'. Peers: ${data.peers.length}`);
            setInCall(true); // Now in call
            setInLobby(false);
            if (data.peers.length > 0) {
              setRemotePeerName(data.peers[0].userName); // Assuming 1:1 for now
              await makeOffer(); // If there are peers, become the caller to initiate offer
            }
            break;
          case 'participantJoined':
            setStatus(`${data.participant.userName} joined the room.`);
            // If another participant joins and we are ready, we might want to initiate offer if we're not already talking to someone
            // For 1:1, we only handle one remote peer at a time.
            if (!pcRef.current || pcRef.current.connectionState !== 'connected') {
                 setRemotePeerName(data.participant.userName);
                 await makeOffer(); // Become the caller if no active peer connection
            }
            break;
          case 'participantLeft':
            setStatus(`${data.participant.userName} left the room.`);
            // Consider cleaning up RTCPeerConnection if this was our only peer
            if (remotePeerName === data.participant.userName) {
              cleanup(); // End the call if the connected peer leaves
            }
            break;
          case 'offer':
            setStatus('Received offer. Answering...');
            await handleOffer(data.payload, data.senderName);
            break;
          case 'answer':
            setStatus('Received answer. Connecting...');
            await handleAnswer(data.payload);
            break;
          case 'ice-candidate':
            setStatus('Received ICE candidate.');
            await handleRemoteICE(data.payload);
            break;
          case 'chatMessage':
            setChatMessages(prev => [...prev, { ...data.payload, timestamp: new Date() }]);
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (e) {
        console.error('Signaling message error', e);
        setStatus(`Error processing signaling message: ${e.message}`);
      }
    };

    wsRef.current.onclose = () => {
      setStatus('Signaling disconnected.');
      // Only set inLobby if we weren't already in a call, otherwise it's just a disconnect from signaling
      if (!inCall) setInLobby(true);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('Signaling connection error. Please try again.');
    };
  }

  async function ensurePeerConnection() {
    if (pcRef.current && (pcRef.current.connectionState === 'connecting' || pcRef.current.connectionState === 'connected')) {
        return pcRef.current;
    }
    setStatus('Establishing peer connection...');
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    // Send any ICE candidates to signaling server
    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ice-candidate', room: roomId, payload: e.candidate }));
      }
    };

    // Listen for remote tracks and attach to remote video element
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
          setStatus('Remote stream received!');
        }
      }
    };

    // Add local tracks to the peer connection
    if (!localStreamRef.current) await startLocalStream();
    localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));

    pc.onconnectionstatechange = () => {
        setStatus(`RTC Connection State: ${pc.connectionState}`);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            console.log("RTC connection state changed:", pc.connectionState);
            cleanup(); // Perform cleanup if connection drops
        }
    };
    pc.onnegotiationneeded = async () => {
        // This event indicates that an ICE renegotiation is needed, e.g., when a track is added/removed.
        // For 1:1, simple scenario, we might initiate an offer if we're the 'caller' or if state implies renegotiation.
        // For a more robust multi-party, this would trigger specific offer/answer logic.
        console.log("Negotiation needed.");
        // await makeOffer(); // uncomment if you need renegotiation on events like addTrack/removeTrack
    };


    return pc;
  }

  async function makeOffer() {
    setStatus('Creating offer...');
    const pc = await ensurePeerConnection();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({ type: 'offer', room: roomId, payload: offer }));
      setStatus('Offer sent. Waiting for answer...');
    } catch (e) {
      console.error('Error creating or sending offer:', e);
      setStatus('Failed to create or send offer.');
    }
  }

  async function handleOffer(offer, senderName) {
    setRemotePeerName(senderName || 'Remote User');
    setStatus('Received offer. Creating answer...');
    const pc = await ensurePeerConnection();
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsRef.current.send(JSON.stringify({ type: 'answer', room: roomId, payload: answer }));
      setStatus('Answer sent. Establishing connection...');
    } catch (e) {
      console.error('Error handling offer or sending answer:', e);
      setStatus('Failed to handle offer.');
    }
  }

  async function handleAnswer(answer) {
    setStatus('Received answer. Finalizing connection...');
    const pc = pcRef.current;
    if (!pc) {
      console.warn('No peer connection to handle answer.');
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      setStatus('Connection established!');
    } catch (e) {
      console.error('Error handling answer:', e);
      setStatus('Failed to finalize connection.');
    }
  }

  async function handleRemoteICE(candidate) {
    const pc = pcRef.current;
    if (!pc) {
      console.warn('No peer connection to add ICE candidate.');
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      setStatus('ICE candidate added.');
    } catch (e) {
      console.warn('addIceCandidate error (may be an old candidate):', e);
      // This is often just a warning for candidates that arrive late or are already handled.
    }
  }

  async function joinCall() {
    if (!roomId || !userName) {
      alert('Please enter a Room ID and your Name.');
      return;
    }
    try {
      await startLocalStream();
      connectSignaling();
      // setInCall(true); // Moved to 'joined' signal
      setInLobby(false);
      setStatus('Joining call...');
    } catch (e) {
      console.error(e);
      setStatus('Failed to join call.');
    }
  }

  function hangup() {
    cleanup();
  }

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      });
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsVideoOff(!track.enabled);
        // If video is off, maybe display a placeholder or hide local video for other peers
        // For local display, we just update the UI
        if (localVideoRef.current) {
            localVideoRef.current.style.display = track.enabled ? 'block' : 'none';
        }
      });
    }
  };

  const copyRoomLink = () => {
    const roomLink = `${window.location.origin}?roomId=${roomId}`;
    navigator.clipboard.writeText(roomLink).then(() => {
      setStatus('Room link copied to clipboard!');
      setTimeout(() => setStatus(''), 3000);
    }).catch(err => {
      console.error('Failed to copy room link:', err);
      setStatus('Failed to copy room link.');
    });
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (currentChatMessage.trim() && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const messagePayload = {
        text: currentChatMessage.trim(),
        timestamp: new Date().toISOString(),
      };
      wsRef.current.send(JSON.stringify({ type: 'chatMessage', room: roomId, payload: messagePayload, userName: userName }));
      setCurrentChatMessage('');
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden md:grid md:grid-cols-3 gap-6 p-6">

        <header className="md:col-span-3 flex items-center justify-between pb-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800">Video Call App</h1>
          <div className="text-sm text-gray-600">Status: <span className="font-medium text-blue-700">{status}</span></div>
        </header>

        {inLobby ? (
          // Pre-call Lobby
          <div className="md:col-span-3 flex flex-col items-center justify-center py-10">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Join a Room</h2>
            <div className="w-full max-w-sm space-y-4">
              <div>
                <label htmlFor="userName" className="block text-sm font-medium text-gray-700">Your Name</label>
                <input
                  id="userName"
                  type="text"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="roomId" className="block text-sm font-medium text-gray-700">Room ID</label>
                <input
                  id="roomId"
                  type="text"
                  value={roomId}
                  onChange={e => setRoomId(e.target.value)}
                  placeholder="Enter a room ID"
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={joinCall}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Join Call
              </button>
            </div>
          </div>
        ) : (
          // In-call UI
          <>
            <div className="md:col-span-2 space-y-4">
              <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg relative aspect-video">
                <div className="absolute top-2 left-2 px-2 py-1 bg-black bg-opacity-50 text-white text-sm rounded-md">
                  {userName} (Local)
                </div>
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                {isVideoOff && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white text-lg">
                    Video Off
                  </div>
                )}
              </div>

              <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg relative aspect-video">
                <div className="absolute top-2 left-2 px-2 py-1 bg-black bg-opacity-50 text-white text-sm rounded-md">
                  {remotePeerName} (Remote)
                </div>
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-4 p-4 bg-gray-100 rounded-lg shadow-inner">
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-700'} text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a4 4 0 01-4-4V6a4 4 0 014-4 4 4 0 014 4v2a4 4 0 01-4 4z"></path></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a4 4 0 01-4-4V6a4 4 0 014-4 4 4 0 014 4v2a4 4 0 01-4 4z"></path></svg>
                  )}
                </button>
                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-gray-700'} text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200`}
                  title={isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
                >
                  {isVideoOff ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 12a2 2 0 012-2h.01M4 12a2 2 0 002 2h.01M4 12a2 2 0 012-2M4 12a2 2 0 002 2M4 12L4 12"></path></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 12a2 2 0 012-2h.01M4 12a2 2 0 002 2h.01M4 12a2 2 0 012-2M4 12a2 2 0 002 2M4 12L4 12"></path></svg>
                  )}
                </button>
                <button
                  onClick={hangup}
                  className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
                  title="Hang Up"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <button
                  onClick={copyRoomLink}
                  className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                  title="Copy Room Link"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v.01M12 7v.01M16 7v.01M9 16l3-3m0 0l3 3m-3-3V10m6 6v7H3v-7m18 0l-3-3M6 21v-7m0 0V5a2 2 0 012-2h8a2 2 0 012 2v10m-2 2v-4m-6 4H7m6 0h4"></path></svg>
                </button>
              </div>
            </div>

            {/* Chat Sidebar */}
            <div className="md:col-span-1 flex flex-col bg-gray-50 rounded-lg shadow-inner p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Chat ({roomId})</h3>
              <div ref={chatBoxRef} className="flex-1 overflow-y-auto border border-gray-200 rounded-md p-3 mb-3 bg-white space-y-2">
                {chatMessages.length === 0 ? (
                  <p className="text-sm text-gray-500">No messages yet. Say hello!</p>
                ) : (
                  chatMessages.map((msg, index) => (
                    <div key={index} className="flex flex-col">
                      <span className="text-xs font-semibold text-blue-700">{msg.sender}:</span>
                      <p className="text-sm text-gray-800 break-words">{msg.text}</p>
                      <span className="text-xs text-gray-400 self-end">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={sendChatMessage} className="flex gap-2">
                <input
                  type="text"
                  value={currentChatMessage}
                  onChange={e => setCurrentChatMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  disabled={!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN}
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  disabled={!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !currentChatMessage.trim()}
                >
                  Send
                </button>
              </form>
            </div>
          </>
        )}

        <footer className="md:col-span-3 text-sm text-gray-600 pt-4 border-t border-gray-200 mt-6">
          <p className="text-center">Tip: Open this page in two browser tabs/windows or devices and join the same Room ID to start a P2P call. For cross-network calls, configure TURN servers.</p>
        </footer>
      </div>
    </div>
  );
}