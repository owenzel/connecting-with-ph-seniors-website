const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');
const transporter = require('./../config/email');
const { websiteUrl, successRedirect, errorRedirect } = require('../helpers/node-helpers');
const User = require('./../models/User');

// @desc    Show register page
// @route   GET /users/register
router.get('/register', forwardAuthenticated, (req, res) => {
    return res.render('users/register');
});

// @desc    Show login page
// @route   GET /users/login
router.get('/login', forwardAuthenticated, (req, res) => {
    return res.render('users/login');
});

// @desc    Process register form
// @route   POST /register
router.post('/register', forwardAuthenticated, (req, res) => {
    // Get the submitted fields from the register form
    const { name, username, email, phone, password, password2, signature } = req.body;

    // Store any errors in validating the form submission
    let errors = [];

    // Function for rerendering the page with the submitted information and any errors from validating the submission
    const reRenderWithErrors = () => res.render('users/register', { errors, name, username, email, phone, password, password2 });

    // Check required fields
    if (!name || !username || !phone || !password || !password2 || !signature) errors.push({ msg: 'Please fill in all fields (email is optional but strongly recommended).' });

    // Check passwords match
    if (password !== password2) errors.push({ msg: 'Passwords do not match.' });

    // Check password length
    if (password.length < 6) errors.push({ msg: 'Password should be at least 6 characters in length.' });

    // If there are errors, re-render the page with the errors and entered information passed in
    if (errors.length > 0) return reRenderWithErrors();

    // If there were no erros in validating the form submission, proceed with registering the user
    else {
        User.findOne({ username: username }).then(user => {
            // If the username is already taken, re-render with an error.
            if (user) {
                errors.push({ msg: 'Username is not available.'});
                return reRenderWithErrors();
            }
            // If the username isn't already taken, proceed with saving them to the database
            else {
                // Create a new user with the entered information
                const newUser = new User({
                    name,
                    username,
                    email: email ? email : `${name} (no email)`,
                    phone,
                    password,
                    signature
                });

                // Hash the password
                bcrypt.genSalt(10, (e, salt) =>
                    bcrypt.hash(newUser.password, salt, (e, hash) => {
                        if (e) return errorRedirect(req, res, e, '/users/login', 'There was an error registering. Please try again.');
                        
                        // Set the new user's password to the hashed one
                        newUser.password = hash;

                        // Save the new user to the database
                        newUser.save()
                            .then(user => {
                                // If an email was entered, create a registration confirmation email
                                if (email) {
                                    const emailContent = {
                                        from: `${process.env.EMAIL}`,
                                        to: `${email}`,
                                        subject: `Registered on Connecting With Parma Heights Seniors - Virtual Activities`,
                                        html: `
                                                <p>An account with this email and the username ${username} was registered on <a href="${websiteUrl}/">Connecting with Parma Heights Seniors - Virtual Activities</a>.</p>
                                                <p>Website: ${websiteUrl}/</p>
                                            `
                                    };
                                
                                    // Send the registration confirmation email to the newly registered user
                                    transporter.sendMail(emailContent, (e, data) => {
                                        if (e) console.log(e);
                                    });
                                }
                            })
                            // Redirect to the login page with a success message
                            .then(user => successRedirect(req, res, 'You are now registed and can log in.', '/users/login'))
                            .catch(e => console.log(e));
                }));
            }
        });
    }
});

// @desc    Process login form
// @route   POST /login
router.post('/login', forwardAuthenticated, (req, res, next) => {
    // Clear the Sign Up Cart
    req.session.signUps = [];

    // Authenticate the user
    passport.authenticate('local', {
        successRedirect: '/activities/my-activities',
        failureRedirect: '/users/login',
        failureFlash: true
    })(req, res, next);
});

// @desc    Process logout
// @route   POST /login
router.get('/logout', ensureAuthenticated, (req, res) => {
    // Clear the Sign Up Cart
    req.session.signUps = [];

    // Log the user out via passport
    req.logout((e) => {
        const redirect = '/users/login';
        if (e) return errorRedirect(req, res, e, redirect, 'There was an error logging out. Please try again.');
        
        // Redirect to the login page with a success message
        return successRedirect(req, res, 'You are logged out.', redirect);
    });
});

module.exports = router;