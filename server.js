// Simple WebSocket signaling server
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 });

// rooms: { roomId: Set of { ws, userName } }
const rooms = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let data = null;
    try { data = JSON.parse(msg); } catch (e) {
      console.error('Invalid JSON received:', msg);
      return;
    }
    const { type, room, payload, userName } = data; // Added userName

    if (!room) {
      console.warn('Message without room ID:', data);
      return;
    }

    if (type === 'join') {
      let set = rooms.get(room);
      if (!set) { set = new Set(); rooms.set(room, set); }

      // Store WebSocket and userName together
      ws.room = room;
      ws.userName = userName || `Guest-${Math.floor(Math.random() * 1000)}`;
      set.add(ws);

      // Notify the joining client about existing peers
      const peers = Array.from(set).filter(client => client !== ws).map(client => ({
        id: client._socket.remoteAddress + client._socket.remotePort, // Unique ID for peer
        userName: client.userName
      }));
      ws.send(JSON.stringify({ type: 'joined', peers, selfId: ws._socket.remoteAddress + ws._socket.remotePort }));

      // Notify other clients in the room about the new participant
      set.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'participantJoined',
            participant: {
              id: ws._socket.remoteAddress + ws._socket.remotePort,
              userName: ws.userName
            }
          }));
        }
      });
      console.log(`${ws.userName} joined room: ${room}`);
      return;
    }

    // Handle chat messages
    if (type === 'chatMessage') {
        const set = rooms.get(room);
        if (!set) return;
        set.forEach(client => {
            // Broadcast to everyone in the room, including sender, for consistent display
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'chatMessage', payload: { ...payload, sender: ws.userName } }));
            }
        });
        return;
    }

    // forward signaling messages (offer, answer, ice-candidate) to other clients in the same room
    const set = rooms.get(room);
    if (!set) return;
    set.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type, payload, senderName: ws.userName })); // Added senderName for better logging/debugging
      }
    });
  });

  ws.on('close', () => {
    const room = ws.room;
    const userName = ws.userName || 'Unknown';
    if (!room) return;
    const set = rooms.get(room);
    if (!set) return;
    set.delete(ws);

    // Notify other clients in the room about the participant leaving
    set.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'participantLeft',
          participant: {
            id: ws._socket.remoteAddress + ws._socket.remotePort,
            userName: userName
          }
        }));
      }
    });

    if (set.size === 0) rooms.delete(room);
    console.log(`${userName} left room: ${room}. Remaining in room: ${set.size}`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket Error:', error);
  });
});

console.log('Signaling server running on ws://localhost:3001');