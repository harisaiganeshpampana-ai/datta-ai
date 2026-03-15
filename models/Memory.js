const mongoose = require("mongoose");

const MemorySchema = new mongoose.Schema({
  userId: String,
  message: String,
  response: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Memory", MemorySchema);
