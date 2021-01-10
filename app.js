const path = require('path');
const dotenv = require('dotenv'); // for keeping info secure
const morgan = require('morgan'); // for console logs
const express = require('express'); // for web server
const expressLayouts = require('express-ejs-layouts'); // templating language
const flash = require('connect-flash');
const session = require('express-session');
const passport = require('passport');
const connectDB = require('./config/db'); // for connecting to the database with an async-await format (as opposed to promises)

const app = express();

// Load config file
dotenv.config({ path: './config/config.env' });

// Passport config
require('./config/passport')(passport);

// Connect to MongoDB
connectDB();

// Console logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev')); //show the HTTP method, response, etc. in the console in development mode
}

// Set EJS as Template Engine
app.use(expressLayouts);
app.set('view engine', 'ejs');

// Bodyparser middleware
app.use(express.urlencoded({ extended: true }));

// Express Session middleware
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
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
    next();
});

// Define static folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/index'));
app.use('/users', require('./routes/users'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`));