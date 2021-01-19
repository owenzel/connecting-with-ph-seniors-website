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
        default: 'unpublished and under review',
        enum: [ 'unpublished and under review', 'published and under review', 'published' ]
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
    },
    expireAt: {
        type: Date,
        required: true
    },
    imageName: {
        type: String,
        default: 'placeholder.png'
    }
});

module.exports = mongoose.model('Activity', ActivitySchema);