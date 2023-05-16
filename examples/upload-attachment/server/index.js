const fs = require("fs");
const httpServer = require("http").createServer();
const Redis = require("ioredis");
const redisClient = new Redis();
const io = require("socket.io")(httpServer, {
  cors: {
    origin: "http://localhost:8080",
  },
  adapter: require("socket.io-redis")({
    pubClient: redisClient,
    subClient: redisClient.duplicate(),
  }),
});

const initializeFirebaseSDK = require("./firebaseAdmin.js");
const firebase = require("firebase-admin");

const { setupWorker } = require("@socket.io/sticky");
const crypto = require("crypto");
const randomId = () => crypto.randomBytes(8).toString("hex");

const { RedisSessionStore } = require("./sessionStore");
const sessionStore = new RedisSessionStore(redisClient);

const { RedisMessageStore } = require("./messageStore");
const messageStore = new RedisMessageStore(redisClient);

initializeFirebaseSDK();

async function sendMessagesToOfflineUsers(chat) {
    var messagePayload = {
      data: {
        type: "CHAT",
        title: "chat",
        message: chat.content,
        sender: chat.from,
        recipient: chat.to,
        time: new Date().toString()
      },
      tokens: []
    };

    console.log(messagePayload);

    const userTokens = 
        sessionStore.findAllSessions().then((res)=>{

            res = res.filter((session) => { 
                return (!session.connected && session.userID === chat.to) 
            }).map(session => {
                return session.registrationToken
            });
        
            if (res.length == 0) {
                console.log("no users to notify");
                return;
            }

            messagePayload.tokens = res;

            try {
                firebase.messaging().sendMulticast(messagePayload).then((success)=>{
                    console.log("user notified!");
                }, (err)=>{
                    console.log(err);
                });
            } catch (ex) {
                console.log(ex);
            }

        }) ;
}

io.use(async (socket, next) => {
  const sessionID = socket.handshake.auth.sessionID;
  const registrationToken = socket.handshake.auth.registrationToken;
  if (sessionID) {
    const session = await sessionStore.findSession(sessionID);
    if (session) {
      socket.sessionID = sessionID;
      socket.userID = session.userID;
      socket.username = session.username;
      socket.registrationToken = registrationToken;
      return next();
    }
  }
  const username = socket.handshake.auth.username;

  if (!username) {
    return next(new Error("invalid username"));
  }
  socket.sessionID = randomId();
  socket.userID = randomId();
  socket.username = username;
  socket.registrationToken = registrationToken;
  next();
});

io.on("connection", async (socket) => {
  // persist session
  sessionStore.saveSession(socket.sessionID, {
    userID: socket.userID,
    username: socket.username,
    connected: true,
    registrationToken: socket.registrationToken,
  });

  // emit session details
  socket.emit("session", {
    sessionID: socket.sessionID,
    userID: socket.userID,
  });

  // join the "userID" room
  socket.join(socket.userID);

  // fetch existing users
  const users = [];
  const [messages, sessions] = await Promise.all([
    messageStore.findMessagesForUser(socket.userID),
    sessionStore.findAllSessions(),
  ]);
  const messagesPerUser = new Map();
  messages.forEach((message) => {
    const { from, to } = message;
    const otherUser = socket.userID === from ? to : from;
    if (messagesPerUser.has(otherUser)) {
      messagesPerUser.get(otherUser).push(message);
    } else {
      messagesPerUser.set(otherUser, [message]);
    }
  });

  sessions.forEach((session) => {
    users.push({
      userID: session.userID,
      username: session.username,
      connected: session.connected,
      registrationToken: session.registrationToken,
      messages: messagesPerUser.get(session.userID) || [],
    });
  });
  socket.emit("users", users);

  // notify existing users
  socket.broadcast.emit("user connected", {
    userID: socket.userID,
    username: socket.username,
   

      connected: true,
    messages: [],
  });

  // forward the private message to the right recipient (and to other tabs of the sender)
  socket.on("private message", ({ content, to },cb) => {
    const message = {
      messageID: require("crypto").randomBytes(64).toString('hex'),
      content,
      from: socket.userID,
      to,
    };
    socket.to(to).to(socket.userID).emit("private message", message);
    sendMessagesToOfflineUsers({content, to, from: socket.userID});
    messageStore.saveMessage(message);
      cb(message.messageID);
  });

  socket.on("upload", ({file,to,extension}, cb) => {
    // save the content to the disk, for example
    var randomFileName = require("crypto").randomBytes(16).toString('hex');
    fs.writeFile(`/tmp/${randomFileName}.${extension}`, file, (err) => {
        if (!err) {
            const message = {
              messageID: require("crypto").randomBytes(64).toString('hex'),
              content: "::FILE::",
              from: socket.userID,
              to,
            };
            socket.to(to).to(socket.userID).emit("private message", message);
            socket.to(to).to(socket.userID).emit("upload", {file,extension});
            messageStore.saveMessage(message);
            cb(message.messageID);
        }
        else{
            console.log(err);
        }
    });
  });

  // save the new FCM token
  socket.on("new token", (token)=>{
    socket.registrationToken = token.token;
    sessionStore.saveSession(socket.sessionID, {
      userID: socket.userID,
      username: socket.username,
      connected: true,
      registrationToken: token.token,
    });
  });

  // set messages as read
  socket.on("read message", async () => {

  });
  // notify users upon disconnection
  socket.on("disconnect", async () => {
    const matchingSockets = await io.in(socket.userID).allSockets();
    const isDisconnected = matchingSockets.size === 0;
    if (isDisconnected) {
      // notify other users
      socket.broadcast.emit("user disconnected", socket.userID);
      // update the connection status of the session
      sessionStore.saveSession(socket.sessionID, {
        userID: socket.userID,
        username: socket.username,
        connected: false,
        registrationToken: socket.registrationToken,
      });
    }
  });
});

setupWorker(io);
