const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true
    },
    email: {
        type: String,
        default: ""
    },
    phone: {
        type: String,
        required: false
    },
    password: {
        type: String,
        required: true
    },
    signature: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('User', UserSchema);