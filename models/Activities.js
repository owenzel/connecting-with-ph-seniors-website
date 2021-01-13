const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    date: {
        type: Date,
        required: true
    },
    leaderName: {
        type: String,
        required: true
    },
    leaderUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        default: 'public',
        enum: ['public', 'private']
    },
    body: {
        type: String,
        required: true
    },
    creatorUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    rsvps: {
        type: Array,
        default: []
    }
});

module.exports = mongoose.model('Activity', ActivitySchema);