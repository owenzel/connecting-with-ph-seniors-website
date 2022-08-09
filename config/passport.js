const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');

// Load User Model
const User = require('./../models/User');

module.exports = function(passport) {
    passport.use(
        new LocalStrategy({ usernameField: 'username' }, (username, password, done) => {
            // Match User
            User.findOne({ username: username })
                .then(user => {
                    if (!user) { // If there is no match
                        return done(null, false, { message: 'That username is not registered.' });
                    }

                    // Match password
                    bcrypt.compare(password, user.password, (e, isMatch) => {
                        if (e) throw e;
                        if (isMatch) {
                            return done(null, user);
                        } else {
                            return done(null, false, { message: 'Password is incorrect.' });
                        }
                    });
                })
                .catch(e => console.log(e));
        })
    );

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser((id, done) => {
        User.findById(id, (e, user) => {
            done(e, user);
        });
    });
}