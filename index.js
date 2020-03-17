const express = require('express'),
  http = require('http');
const socketio = require('socket.io')
const cors = require('cors');

const expressLayouts = require('express-ejs-layouts');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const session = require('express-session');
const passport = require('passport');
const path = require('path');

const { addUser, removeUser, getUser, getUsersInRoom } = require('./util/users');

const PORT = process.env.PORT || 4000;

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  pingTimeout: 30000
});

// Passport config
require('./config/passport')(passport);

// DB Config
const db = require('./config/keys').MongoURI;

//Connect to Mongo
mongoose
  .connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected...'))
  .catch(e => console.log(e));

//EJS
app.use(expressLayouts);
app.use(cors());
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'views')));

//Bodyparser
app.use(express.urlencoded({ extended: true }));

//Express Session
app.use(
  session({
    secret: 'mysecret',
    resave: true,
    saveUninitialized: true
  })
);

//Passport middleware
app.use(passport.initialize());
app.use(passport.session());

//Connect flash
app.use(flash());

//Global Vars
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  next();
});

app.use(express.json());

//Routes
app
  .use('/messages', require('./routes/messages'))
  .use('/users', require('./routes/users'))
  .use('/', require('./routes/index'))

app.use(cors());

io.on('connect', socket => {
  console.log('New connection established');

  socket.on('join', ( name, room , callback) => {
    
    const { error, user } = addUser({ id: socket.id, name, room });
    if (error) return callback(error);

    socket.emit('message', {
      user: 'admin',
      text: `${name}, welcome to the room ${room}`
    });

    socket.broadcast
      .to(room)
      .emit('message', { user: 'admin', text: `${name} has joined!` });

    socket.join(room);

    io.to(room).emit('roomData', {
      room: room,
      users: getUsersInRoom(room)
    });

    callback();
  });

  socket.on('sendMessage', (message, callback) => {
    const user = getUser(socket.id);
    io.to(user.room).emit('message', { user: user.name, text: message });
    callback();
  });

  socket.on('disconnect', () => {
    const user = removeUser(socket.id);
    if (user) {
      io.to(user.room).emit('message', {
        user: 'admin',
        text: `${user.name} has left!`
      });
      io.to(user.room).emit('roomData', {
        room: user.room,
        users: getUsersInRoom(user.room)
      });
    }
  });
 }
);

server.listen(PORT, console.log(`Server started on port ${PORT}`));