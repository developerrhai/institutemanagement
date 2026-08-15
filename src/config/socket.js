const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const db = require("./db");

let io;

module.exports = {
  init: (server) => {
    io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || ["http://localhost:3000", "https://merit-home.vercel.app"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        credentials: true,
      },
    });

    // ── Authentication Middleware ──
    io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded; // { id, role, ... }
        next();
      } catch (err) {
        next(new Error("Authentication error: Invalid token"));
      }
    });

    // ── Connection Handler ──
    io.on("connection", async (socket) => {
      console.log(`Socket connected: ${socket.id}, User: ${socket.user.id} (${socket.user.role})`);

      // 1. Auto-join user to all their group rooms
      try {
        let groups = [];
        const upperRole = socket.user.role?.toUpperCase() || '';
        
        if (upperRole === 'ADMIN') {
           const [adminGroups] = await db.query(`SELECT id FROM chat_groups WHERE is_deleted = FALSE`);
           groups = adminGroups;
        } else {
           const [userGroups] = await db.query(
             `SELECT group_id as id FROM chat_group_members WHERE user_id = ? AND user_role = ? AND removed_at IS NULL`,
             [socket.user.id, upperRole]
           );
           groups = userGroups;
        }
        
        groups.forEach((g) => {
          socket.join(`group_${g.id}`);
        });
      } catch (err) {
        console.error("Error auto-joining groups:", err);
      }

      // 2. Handle joining a specific group room (manual request)
      socket.on("join_group", async (data, callback) => {
        try {
          const { groupId } = data;
          const upperRole = socket.user.role?.toUpperCase() || '';
          
          if (upperRole !== 'ADMIN') {
              const [membership] = await db.query(
                `SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND user_role = ? AND removed_at IS NULL`,
                [groupId, socket.user.id, upperRole]
              );
              if (membership.length === 0) {
                 if (callback) callback({ success: false, message: "Access denied" });
                 return;
              }
          }

          socket.join(`group_${groupId}`);
          if (callback) callback({ success: true });
        } catch (err) {
          console.error("Error joining group:", err);
          if (callback) callback({ success: false, message: "Server error" });
        }
      });

      // 3. Handle sending a message
      socket.on("send_message", async (data, callback) => {
        try {
          const { groupId, messageText } = data;
          const { id: userId, role } = socket.user;
          const upperRole = role ? role.toUpperCase() : '';

          // Verify membership before sending
          if (upperRole !== 'ADMIN') {
              const [membership] = await db.query(
                `SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND user_role = ? AND removed_at IS NULL`,
                [groupId, userId, upperRole]
              );
              if (membership.length === 0) {
                 if (callback) callback({ success: false, message: "Access denied" });
                 return;
              }
          }

          // Fetch sender name
          let table = 'students';
          if (upperRole === 'ADMIN') table = 'admins';
          else if (upperRole === 'TEACHER') table = 'teachers';
          
          const [userRows] = await db.query(`SELECT name FROM ?? WHERE id = ?`, [table, userId]);
          const senderName = userRows[0]?.name || 'Unknown';

          // Insert into DB
          const [result] = await db.query(
            `INSERT INTO chat_messages (group_id, sender_id, sender_role, sender_name, message_text) 
             VALUES (?, ?, ?, ?, ?)`,
            [groupId, userId, upperRole, senderName, messageText]
          );

          const messageObj = {
            id: result.insertId,
            group_id: groupId,
            sender_id: userId,
            sender_role: upperRole,
            sender_name: senderName,
            message_text: messageText,
            created_at: new Date().toISOString()
          };

          // Broadcast to everyone in the room (including sender so they can render it)
          io.to(`group_${groupId}`).emit("receive_message", messageObj);
          
          if (callback) callback({ success: true });
        } catch (err) {
          console.error("Error sending message:", err);
          if (callback) callback({ success: false, message: "Server error" });
        }
      });

      // 4. Typing indicators
      socket.on("typing_start", (data) => {
         socket.to(`group_${data.groupId}`).emit("user_typing", { 
            groupId: data.groupId, 
            userId: socket.user.id,
            isTyping: true 
         });
      });

      socket.on("typing_stop", (data) => {
         socket.to(`group_${data.groupId}`).emit("user_typing", { 
            groupId: data.groupId, 
            userId: socket.user.id,
            isTyping: false 
         });
      });

      socket.on("disconnect", () => {
        console.log(`Socket disconnected: ${socket.id}`);
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  }
};
