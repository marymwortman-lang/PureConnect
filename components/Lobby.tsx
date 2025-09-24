import React, { useState } from 'react';

interface LobbyProps {
  onJoin: (roomId: string) => void;
  isJoining: boolean;
}

const Lobby: React.FC<LobbyProps> = ({ onJoin, isJoining }) => {
  const [roomId, setRoomId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      onJoin(roomId.trim());
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4">
        <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">BandhanCall</h1>
            <p className="text-slate-400 mt-2">Minimalist Peer-to-Peer Video Chat</p>
        </div>
      <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
        <h2 className="text-2xl font-semibold text-center text-white mb-6">Join a Room</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="roomId" className="block text-sm font-medium text-slate-300 mb-2">Room ID</label>
            <input
              id="roomId"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="e.g., my-secret-room"
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              disabled={isJoining}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center"
            disabled={!roomId.trim() || isJoining}
          >
            {isJoining ? (
                 <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Joining...
                 </>
            ) : "Join Call"}
          </button>
        </form>
      </div>
      <footer className="text-center mt-8 text-slate-500 text-sm">
        <p>Your connection is secure and peer-to-peer.</p>
      </footer>
    </div>
  );
};

export default Lobby;
