const path = require('path');
const dotenv = require('dotenv'); // for keeping info secure
const morgan = require('morgan'); // for console logs
const express = require('express'); // for web server
const expressLayouts = require('express-ejs-layouts'); // templating language
const methodOverride = require('method-override'); // for sending PUT and DELETE requests
const flash = require('connect-flash'); // for persisting messages on redirects
// For sessions, cookies, and authentication
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const passport = require('passport');
const mongoose = require('mongoose'); // for communicating with the Mongo DB
const connectDB = require('./config/db'); // for connecting to the database with an async-await format (as opposed to promises)

// Load config file
dotenv.config({ path: './config/config.env' });

// Passport config
require('./config/passport')(passport);

// Connect to MongoDB
connectDB();

// Create Express app
const app = express();

// Bodyparser middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Method override middleware
app.use(methodOverride(function (req, res) {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      // look in urlencoded POST bodies and delete it
      let method = req.body._method;
      delete req.body._method;
      return method;
    }
}));

// Console logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev')); //show the HTTP method, response, etc. in the console in development mode
}

// EJS helpers
const { getDateRangeStartingToday, formatDate, stripTags, truncate, addToCart, editIcon, deleteBtn, cancelRsvpBtn, approveBtn, rejectBtn } = require('./helpers/ejs-helpers');
app.locals.getDateRangeStartingToday = getDateRangeStartingToday;
app.locals.formatDate = formatDate;
app.locals.stripTags = stripTags;
app.locals.truncate = truncate;
app.locals.addToCart = addToCart;
app.locals.editIcon = editIcon;
app.locals.deleteBtn = deleteBtn;
app.locals.cancelRsvpBtn = cancelRsvpBtn;
app.locals.approveBtn = approveBtn;
app.locals.rejectBtn = rejectBtn;

// Set EJS as Template Engine
app.use(expressLayouts);
app.set('view engine', 'ejs');

// Express Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    store: new MongoStore({ mongooseConnection: mongoose.connection }),
    cookie: { secure: false }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Connect Flash middleware
app.use(flash());

// Global Variables
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.user || null;
    res.locals.signUps = req.session.signUps || [];
    next();
});

// Define static folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/index'));
app.use('/users', require('./routes/users'));
app.use('/activities', require('./routes/activities'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, console.log(`Server running on port ${PORT}`));